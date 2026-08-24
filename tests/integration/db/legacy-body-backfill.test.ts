import { QueryTypes } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '../../../src/db/mysql';
import { connectMongo, disconnectMongo } from '../../../src/legacy/mongo';
import {
  LegacyBodyBackfillMismatchError,
  runLegacyBodyBackfill
} from '../../../docker/db/legacy-body-backfill';
import type { MessageResponse } from '../../support/contracts/message-contract';
import {
  insertStoredMessageBodies,
  updateStoredMessageBody
} from '../../support/database/mongo-test-store';
import {
  countStoredMessageBodyRows,
  deleteStoredMessageBodyRows,
  findStoredMessageBodyRow,
  listStoredMessages
} from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

interface LegacyDataset {
  conversationId: number;
  messageIds: number[];
  bodies: Map<number, string>;
}

async function readCheckpoint(): Promise<number> {
  const rows = await sequelize.query<{ lastDocumentId: number }>(
    'SELECT last_document_id AS lastDocumentId FROM message_body_backfill_state WHERE id = 1',
    { type: QueryTypes.SELECT }
  );

  return rows[0]?.lastDocumentId ?? 0;
}

async function resetCheckpoint(): Promise<void> {
  await sequelize.query(
    'UPDATE message_body_backfill_state SET last_document_id = 0, copied_count = 0 WHERE id = 1'
  );
}

async function createLegacyDataset(messageCount: number): Promise<LegacyDataset> {
  const actor = await createRegisteredUser();
  const participant = await createRegisteredUser();
  const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
  const bodies = new Map<number, string>();

  for (let index = 0; index < messageCount; index += 1) {
    const body = `Legacy backfill body ${index + 1}`;
    const response = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body })
    });

    if (response.status !== 201) throw new Error('Could not create message');
    bodies.set(response.body.id, body);
  }

  const storedMessages = await listStoredMessages(conversation.id);
  const messageIds = storedMessages.map(message => message.id);

  await deleteStoredMessageBodyRows(messageIds);
  await insertStoredMessageBodies(
    storedMessages.map(message => ({
      _id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      body: bodies.get(message.id) ?? '',
      createdAt: message.createdAt
    }))
  );

  return { conversationId: conversation.id, messageIds, bodies };
}

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
  await sequelize.close();
});

describe('legacy Mongo body backfill', () => {
  it('copies every legacy body into MySQL, checkpoints, and reconciles the summary preview', async () => {
    const dataset = await createLegacyDataset(3);

    await sequelize.query(
      'UPDATE conversation_summaries SET last_message_preview = NULL WHERE conversation_id = :id',
      { replacements: { id: dataset.conversationId } }
    );

    const result = await runLegacyBodyBackfill();

    expect(result).toMatchObject({
      scanned: 3,
      inserted: 3,
      skippedIdentical: 0,
      drained: true
    });
    expect(await readCheckpoint()).toBe(Math.max(...dataset.messageIds));

    for (const messageId of dataset.messageIds) {
      expect(await findStoredMessageBodyRow(messageId)).toEqual({
        messageId,
        body: dataset.bodies.get(messageId)
      });
    }

    const summaryRows = await sequelize.query<{ preview: string | null }>(
      `SELECT last_message_preview AS preview FROM conversation_summaries
      WHERE conversation_id = :id`,
      { replacements: { id: dataset.conversationId }, type: QueryTypes.SELECT }
    );

    expect(summaryRows[0]?.preview).toBe(dataset.bodies.get(Math.max(...dataset.messageIds)));
  }, 30000);

  it('is idempotent: a re-run over the same documents inserts nothing and changes nothing', async () => {
    const dataset = await createLegacyDataset(3);

    const firstRun = await runLegacyBodyBackfill();

    expect(firstRun.inserted).toBe(3);

    await resetCheckpoint();
    const secondRun = await runLegacyBodyBackfill();

    expect(secondRun).toMatchObject({
      scanned: 3,
      inserted: 0,
      skippedIdentical: 3,
      drained: true
    });
    expect(await countStoredMessageBodyRows()).toBe(3);
    expect(await findStoredMessageBodyRow(dataset.messageIds[0])).toEqual({
      messageId: dataset.messageIds[0],
      body: dataset.bodies.get(dataset.messageIds[0])
    });
  }, 30000);

  it('resumes from the checkpoint after a partial run', async () => {
    const dataset = await createLegacyDataset(3);
    const sortedIds = [...dataset.messageIds].sort((left, right) => left - right);

    const partial = await runLegacyBodyBackfill({ batchSize: 2, maxBatches: 1 });

    expect(partial).toMatchObject({ scanned: 2, inserted: 2, drained: false });
    expect(await readCheckpoint()).toBe(sortedIds[1]);
    expect(await findStoredMessageBodyRow(sortedIds[0])).not.toBeNull();
    expect(await findStoredMessageBodyRow(sortedIds[2])).toBeNull();

    const resumed = await runLegacyBodyBackfill({ batchSize: 2 });

    expect(resumed).toMatchObject({ scanned: 1, inserted: 1, drained: true });
    expect(await readCheckpoint()).toBe(sortedIds[2]);
    expect(await findStoredMessageBodyRow(sortedIds[2])).not.toBeNull();
  }, 30000);

  it('halts on a body hash mismatch, records it, and writes nothing from the batch', async () => {
    const dataset = await createLegacyDataset(3);

    await updateStoredMessageBody(dataset.messageIds[1], { body: 'tampered content' });

    await expect(runLegacyBodyBackfill()).rejects.toThrow(LegacyBodyBackfillMismatchError);

    expect(await readCheckpoint()).toBe(0);
    expect(await countStoredMessageBodyRows()).toBe(0);

    const mismatchRows = await sequelize.query<{ messageId: number; reason: string }>(
      `SELECT message_id AS messageId, reason FROM message_body_backfill_mismatches`,
      { type: QueryTypes.SELECT }
    );

    expect(mismatchRows).toEqual([{ messageId: dataset.messageIds[1], reason: 'hash-mismatch' }]);
  }, 30000);
});
