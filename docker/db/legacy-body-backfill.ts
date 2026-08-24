import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/db/mysql';
import { MessageBodyModel } from '../../src/legacy/message-body-model';
import { MessageBody } from '../../src/models/sql';
import { hashMessageBody } from '../../src/services/message-body-hash';

const defaultBatchSize = 500;

export interface LegacyBodyBackfillOptions {
  batchSize?: number;
  maxBatches?: number;
}

export interface LegacyBodyBackfillResult {
  scanned: number;
  inserted: number;
  skippedIdentical: number;
  lastDocumentId: number;
  drained: boolean;
}

interface MetadataRow {
  id: number;
  conversationId: number;
  senderId: number;
  bodyHash: string;
  createdAt: Date;
}

interface BodyRow {
  messageId: number;
  body: string;
}

interface Mismatch {
  messageId: number;
  reason: string;
  detail: string | null;
}

export class LegacyBodyBackfillMismatchError extends Error {
  constructor(public readonly mismatches: readonly Mismatch[]) {
    super(
      `Legacy body backfill found ${mismatches.length} mismatches; ` +
        'see message_body_backfill_mismatches and resolve before retrying'
    );
    this.name = 'LegacyBodyBackfillMismatchError';
  }
}

async function readCheckpoint(): Promise<number> {
  await sequelize.query(
    'INSERT IGNORE INTO message_body_backfill_state (id, last_document_id, copied_count) VALUES (1, 0, 0)'
  );
  const rows = await sequelize.query<{ lastDocumentId: number }>(
    'SELECT last_document_id AS lastDocumentId FROM message_body_backfill_state WHERE id = 1',
    { type: QueryTypes.SELECT }
  );

  return rows[0]?.lastDocumentId ?? 0;
}

async function recordMismatches(mismatches: readonly Mismatch[]): Promise<void> {
  for (const mismatch of mismatches) {
    await sequelize.query(
      `INSERT INTO message_body_backfill_mismatches (message_id, reason, detail)
      VALUES (:messageId, :reason, :detail) AS incoming
      ON DUPLICATE KEY UPDATE
        reason = incoming.reason,
        detail = incoming.detail,
        recorded_at = NOW(3)`,
      { replacements: { ...mismatch } }
    );
  }
}

function collectMismatches(
  docs: readonly {
    _id: number;
    conversationId: number;
    senderId: number;
    body: string;
    createdAt: Date;
  }[],
  metadataById: ReadonlyMap<number, MetadataRow>,
  bodyById: ReadonlyMap<number, string>
): { mismatches: Mismatch[]; toInsert: BodyRow[]; skippedIdentical: number } {
  const mismatches: Mismatch[] = [];
  const toInsert: BodyRow[] = [];
  let skippedIdentical = 0;

  for (const doc of docs) {
    const metadata = metadataById.get(doc._id);

    if (!metadata) {
      mismatches.push({ messageId: doc._id, reason: 'missing-metadata', detail: null });
      continue;
    }

    if (metadata.conversationId !== doc.conversationId) {
      mismatches.push({
        messageId: doc._id,
        reason: 'conversation-mismatch',
        detail: `mysql=${metadata.conversationId} mongo=${doc.conversationId}`
      });
      continue;
    }

    if (metadata.senderId !== doc.senderId) {
      mismatches.push({
        messageId: doc._id,
        reason: 'sender-mismatch',
        detail: `mysql=${metadata.senderId} mongo=${doc.senderId}`
      });
      continue;
    }

    if (new Date(metadata.createdAt).getTime() !== new Date(doc.createdAt).getTime()) {
      mismatches.push({
        messageId: doc._id,
        reason: 'created-at-mismatch',
        detail: `mysql=${new Date(metadata.createdAt).toISOString()} mongo=${new Date(doc.createdAt).toISOString()}`
      });
      continue;
    }

    if (hashMessageBody(doc.body) !== metadata.bodyHash) {
      mismatches.push({ messageId: doc._id, reason: 'hash-mismatch', detail: null });
      continue;
    }

    const storedBody = bodyById.get(doc._id);

    if (storedBody === undefined) {
      toInsert.push({ messageId: doc._id, body: doc.body });
      continue;
    }

    if (storedBody !== doc.body) {
      mismatches.push({ messageId: doc._id, reason: 'body-divergence', detail: null });
      continue;
    }

    skippedIdentical += 1;
  }

  return { mismatches, toInsert, skippedIdentical };
}

async function loadMetadataById(ids: readonly number[]): Promise<Map<number, MetadataRow>> {
  const rows = await sequelize.query<MetadataRow>(
    `SELECT id, conversation_id AS conversationId, sender_id AS senderId,
      body_hash AS bodyHash, created_at AS createdAt
    FROM messages WHERE id IN (:ids)`,
    { replacements: { ids: [...ids] }, type: QueryTypes.SELECT }
  );

  return new Map(rows.map(row => [row.id, row]));
}

async function loadBodyById(ids: readonly number[]): Promise<Map<number, string>> {
  const rows = await sequelize.query<BodyRow>(
    'SELECT message_id AS messageId, body FROM message_bodies WHERE message_id IN (:ids)',
    { replacements: { ids: [...ids] }, type: QueryTypes.SELECT }
  );

  return new Map(rows.map(row => [row.messageId, row.body]));
}

async function verifyInsertedBodies(toInsert: readonly BodyRow[]): Promise<void> {
  if (!toInsert.length) return;

  const storedById = await loadBodyById(toInsert.map(row => row.messageId));
  const mismatches: Mismatch[] = [];

  for (const row of toInsert) {
    if (storedById.get(row.messageId) !== row.body) {
      mismatches.push({ messageId: row.messageId, reason: 'body-divergence', detail: null });
    }
  }

  if (mismatches.length) {
    await recordMismatches(mismatches);
    throw new LegacyBodyBackfillMismatchError(mismatches);
  }
}

async function reconcileSummaries(): Promise<void> {
  await sequelize.query(`INSERT INTO conversation_summaries
      (conversation_id, last_message_id, last_message_at, last_sender_id, last_message_preview)
    SELECT src.conversation_id, src.id, src.created_at, src.sender_id, LEFT(src.body, 300)
    FROM (
      SELECT m.conversation_id, m.id, m.created_at, m.sender_id, b.body
      FROM messages m
      JOIN message_bodies b ON b.message_id = m.id
      JOIN (
        SELECT conversation_id, MAX(id) AS max_id FROM messages GROUP BY conversation_id
      ) latest ON latest.conversation_id = m.conversation_id AND latest.max_id = m.id
    ) AS src
    ON DUPLICATE KEY UPDATE
      last_message_at = IF(src.id > COALESCE(conversation_summaries.last_message_id, 0),
        src.created_at, conversation_summaries.last_message_at),
      last_sender_id = IF(src.id > COALESCE(conversation_summaries.last_message_id, 0),
        src.sender_id, conversation_summaries.last_sender_id),
      last_message_preview = IF(src.id > COALESCE(conversation_summaries.last_message_id, 0),
        LEFT(src.body, 300), conversation_summaries.last_message_preview),
      last_message_id = IF(src.id > COALESCE(conversation_summaries.last_message_id, 0),
        src.id, conversation_summaries.last_message_id)`);

  await sequelize.query(`UPDATE conversation_summaries s
    JOIN message_bodies b ON b.message_id = s.last_message_id
    SET s.last_message_preview = LEFT(b.body, 300)
    WHERE s.last_message_preview IS NULL`);
}

export async function runLegacyBodyBackfill(
  options: LegacyBodyBackfillOptions = {}
): Promise<LegacyBodyBackfillResult> {
  const batchSize = options.batchSize ?? defaultBatchSize;
  let cursor = await readCheckpoint();
  let scanned = 0;
  let inserted = 0;
  let skippedIdentical = 0;
  let batches = 0;
  let drained = false;

  while (options.maxBatches === undefined || batches < options.maxBatches) {
    const docs = await MessageBodyModel.find({ _id: { $gt: cursor } })
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean()
      .exec();

    if (!docs.length) {
      drained = true;
      break;
    }

    batches += 1;
    scanned += docs.length;
    const ids = docs.map(doc => doc._id);
    const metadataById = await loadMetadataById(ids);
    const bodyById = await loadBodyById(ids);
    const batch = collectMismatches(docs, metadataById, bodyById);

    if (batch.mismatches.length) {
      await recordMismatches(batch.mismatches);
      throw new LegacyBodyBackfillMismatchError(batch.mismatches);
    }

    const batchMaxId = ids[ids.length - 1];

    await sequelize.transaction(async transaction => {
      if (batch.toInsert.length) {
        await MessageBody.bulkCreate(batch.toInsert, { ignoreDuplicates: true, transaction });
      }

      await sequelize.query(
        `UPDATE message_body_backfill_state
        SET last_document_id = :batchMaxId, copied_count = copied_count + :insertedCount
        WHERE id = 1`,
        { replacements: { batchMaxId, insertedCount: batch.toInsert.length }, transaction }
      );
    });

    await verifyInsertedBodies(batch.toInsert);

    inserted += batch.toInsert.length;
    skippedIdentical += batch.skippedIdentical;
    cursor = batchMaxId;
  }

  if (drained) await reconcileSummaries();

  return { scanned, inserted, skippedIdentical, lastDocumentId: cursor, drained };
}
