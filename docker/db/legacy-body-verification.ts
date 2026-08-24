import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/db/mysql';
import { MessageBodyModel } from '../../src/legacy/message-body-model';
import { hashMessageBody } from '../../src/services/message-body-hash';

const defaultBatchSize = 500;
const listCap = 1000;

export interface LegacyBodyMetadataMismatch {
  messageId: number;
  field: string;
}

export interface LegacyBodyVerificationReport {
  mysqlMessages: number;
  mysqlBodies: number;
  mongoBodies: number;
  missingSqlBodies: number[];
  missingMongoBodies: number[];
  orphanSqlBodies: number[];
  orphanMongoDocs: number[];
  sqlHashMismatches: number[];
  mongoHashMismatches: number[];
  metadataMismatches: LegacyBodyMetadataMismatch[];
}

interface VerificationRow {
  id: number;
  conversationId: number;
  senderId: number;
  bodyHash: string;
  createdAt: Date;
  body: string | null;
}

function push(list: number[], value: number): void {
  if (list.length < listCap) list.push(value);
}

export function isCleanReport(report: LegacyBodyVerificationReport): boolean {
  return (
    !report.missingSqlBodies.length &&
    !report.missingMongoBodies.length &&
    !report.orphanSqlBodies.length &&
    !report.orphanMongoDocs.length &&
    !report.sqlHashMismatches.length &&
    !report.mongoHashMismatches.length &&
    !report.metadataMismatches.length
  );
}

export async function runLegacyBodyVerification(
  batchSize = defaultBatchSize
): Promise<LegacyBodyVerificationReport> {
  const report: LegacyBodyVerificationReport = {
    mysqlMessages: 0,
    mysqlBodies: 0,
    mongoBodies: 0,
    missingSqlBodies: [],
    missingMongoBodies: [],
    orphanSqlBodies: [],
    orphanMongoDocs: [],
    sqlHashMismatches: [],
    mongoHashMismatches: [],
    metadataMismatches: []
  };
  let cursor = 0;

  while (true) {
    const rows = await sequelize.query<VerificationRow>(
      `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
        m.body_hash AS bodyHash, m.created_at AS createdAt, b.body
      FROM messages m
      LEFT JOIN message_bodies b ON b.message_id = m.id
      WHERE m.id > :cursor
      ORDER BY m.id
      LIMIT :batchSize`,
      { replacements: { cursor, batchSize }, type: QueryTypes.SELECT }
    );

    if (!rows.length) break;

    report.mysqlMessages += rows.length;
    const docs = await MessageBodyModel.find({ _id: { $in: rows.map(row => row.id) } })
      .lean()
      .exec();
    const docById = new Map(docs.map(doc => [doc._id, doc]));

    for (const row of rows) {
      if (row.body === null) {
        push(report.missingSqlBodies, row.id);
      } else {
        report.mysqlBodies += 1;

        if (hashMessageBody(row.body) !== row.bodyHash) {
          push(report.sqlHashMismatches, row.id);
        }
      }

      const doc = docById.get(row.id);

      if (!doc) {
        push(report.missingMongoBodies, row.id);
        continue;
      }

      if (hashMessageBody(doc.body) !== row.bodyHash) {
        push(report.mongoHashMismatches, row.id);
      }

      if (doc.conversationId !== row.conversationId) {
        report.metadataMismatches.push({ messageId: row.id, field: 'conversationId' });
      }

      if (doc.senderId !== row.senderId) {
        report.metadataMismatches.push({ messageId: row.id, field: 'senderId' });
      }

      if (new Date(doc.createdAt).getTime() !== new Date(row.createdAt).getTime()) {
        report.metadataMismatches.push({ messageId: row.id, field: 'createdAt' });
      }
    }

    cursor = rows[rows.length - 1].id;
  }

  const orphanSqlRows = await sequelize.query<{ messageId: number }>(
    `SELECT b.message_id AS messageId
    FROM message_bodies b
    LEFT JOIN messages m ON m.id = b.message_id
    WHERE m.id IS NULL
    LIMIT :listCap`,
    { replacements: { listCap }, type: QueryTypes.SELECT }
  );

  for (const row of orphanSqlRows) push(report.orphanSqlBodies, row.messageId);

  let mongoCursor = 0;

  while (true) {
    const docs = await MessageBodyModel.find({ _id: { $gt: mongoCursor } })
      .select({ _id: 1 })
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean()
      .exec();

    if (!docs.length) break;

    report.mongoBodies += docs.length;
    const ids = docs.map(doc => doc._id);
    const knownRows = await sequelize.query<{ id: number }>(
      'SELECT id FROM messages WHERE id IN (:ids)',
      { replacements: { ids }, type: QueryTypes.SELECT }
    );
    const knownIds = new Set(knownRows.map(row => row.id));

    for (const id of ids) {
      if (!knownIds.has(id)) push(report.orphanMongoDocs, id);
    }

    mongoCursor = ids[ids.length - 1];
  }

  return report;
}
