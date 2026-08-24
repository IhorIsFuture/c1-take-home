import { QueryTypes } from 'sequelize';
import { connectMysql, disconnectMysql, sequelize } from '../db/mysql';
import { legacyConfig } from './config';
import { MessageBodyModel } from './message-body-model';
import { connectMongo, disconnectMongo } from './mongo';

interface MirrorOutboxRow {
  id: number;
  messageId: number;
}

interface MirrorSourceRow {
  id: number;
  conversationId: number;
  senderId: number;
  createdAt: Date;
  body: string;
}

let stopping = false;

async function mirrorBatch(): Promise<number> {
  const outboxRows = await sequelize.query<MirrorOutboxRow>(
    `SELECT id, message_id AS messageId
    FROM message_outbox
    WHERE mirrored_at IS NULL
    ORDER BY id
    LIMIT :batchSize`,
    { replacements: { batchSize: legacyConfig.mirror.batchSize }, type: QueryTypes.SELECT }
  );

  if (!outboxRows.length) return 0;

  const sources = await sequelize.query<MirrorSourceRow>(
    `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId,
      m.created_at AS createdAt, b.body
    FROM messages m
    JOIN message_bodies b ON b.message_id = m.id
    WHERE m.id IN (:ids)`,
    { replacements: { ids: outboxRows.map(row => row.messageId) }, type: QueryTypes.SELECT }
  );
  const sourceByMessageId = new Map(sources.map(source => [source.id, source]));
  const mirroredOutboxIds = outboxRows
    .filter(row => sourceByMessageId.has(row.messageId))
    .map(row => row.id);

  for (const row of outboxRows) {
    if (!sourceByMessageId.has(row.messageId)) {
      console.error(`Outbox event ${row.id} references message ${row.messageId} without a body`);
    }
  }

  if (sources.length) {
    await MessageBodyModel.bulkWrite(
      sources.map(source => ({
        updateOne: {
          filter: { _id: source.id },
          update: {
            $set: {
              conversationId: source.conversationId,
              senderId: source.senderId,
              body: source.body,
              createdAt: source.createdAt
            }
          },
          upsert: true
        }
      }))
    );
  }

  if (mirroredOutboxIds.length) {
    await sequelize.query(
      `UPDATE message_outbox
      SET mirrored_at = NOW(3)
      WHERE id IN (:ids) AND mirrored_at IS NULL`,
      { replacements: { ids: mirroredOutboxIds } }
    );
  }

  return mirroredOutboxIds.length;
}

async function runMirrorLoop(): Promise<void> {
  while (!stopping) {
    let mirrored = 0;

    try {
      mirrored = await mirrorBatch();
    } catch (error) {
      console.error('Legacy mirror error', error);
    }

    if (stopping) break;

    if (!mirrored) {
      await new Promise(resolve => setTimeout(resolve, legacyConfig.mirror.pollIntervalMs));
    }
  }
}

function requestStop(signal: NodeJS.Signals): void {
  console.log(`legacy mirror received ${signal}, shutting down`);
  stopping = true;
}

process.once('SIGINT', () => requestStop('SIGINT'));
process.once('SIGTERM', () => requestStop('SIGTERM'));

await connectMysql();

try {
  await connectMongo();

  try {
    console.log('legacy mirror started');
    await runMirrorLoop();
  } finally {
    await disconnectMongo();
  }
} finally {
  await disconnectMysql();
}

console.log('legacy mirror stopped');
