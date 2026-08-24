import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequelize } from '../../../src/db/mysql';
import { connectMongo, disconnectMongo } from '../../../src/legacy/mongo';
import {
  isCleanReport,
  runLegacyBodyVerification
} from '../../../docker/db/legacy-body-verification';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { insertStoredMessageBodies } from '../../support/database/mongo-test-store';
import {
  deleteStoredMessageBodyRows,
  listStoredMessages
} from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
  await sequelize.close();
});

describe('legacy body verification', () => {
  it('reports a clean state when both stores agree', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Twin body' })
    });

    const storedMessages = await listStoredMessages(conversation.id);

    await insertStoredMessageBodies(
      storedMessages.map(message => ({
        _id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        body: 'Twin body',
        createdAt: message.createdAt
      }))
    );

    const report = await runLegacyBodyVerification();

    expect(isCleanReport(report)).toBe(true);
    expect(report.mysqlMessages).toBe(1);
    expect(report.mysqlBodies).toBe(1);
    expect(report.mongoBodies).toBe(1);
  }, 30000);

  it('detects missing bodies on either side and orphan Mongo documents', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const first = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Kept in SQL only' })
    });
    const second = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Lost from SQL' })
    });
    const storedMessages = await listStoredMessages(conversation.id);
    const secondRow = storedMessages.find(message => message.id === second.body.id);

    await deleteStoredMessageBodyRows([second.body.id]);
    await insertStoredMessageBodies([
      {
        _id: second.body.id,
        conversationId: conversation.id,
        senderId: secondRow?.senderId ?? actor.auth.user.id,
        body: 'Lost from SQL',
        createdAt: secondRow?.createdAt ?? new Date()
      },
      {
        _id: 999999,
        conversationId: conversation.id,
        senderId: actor.auth.user.id,
        body: 'Orphan document',
        createdAt: new Date()
      }
    ]);

    const report = await runLegacyBodyVerification();

    expect(isCleanReport(report)).toBe(false);
    expect(report.missingSqlBodies).toEqual([second.body.id]);
    expect(report.missingMongoBodies).toEqual([first.body.id]);
    expect(report.orphanMongoDocs).toEqual([999999]);
    expect(report.sqlHashMismatches).toEqual([]);
    expect(report.mongoHashMismatches).toEqual([]);
    expect(report.metadataMismatches).toEqual([]);
  }, 30000);
});
