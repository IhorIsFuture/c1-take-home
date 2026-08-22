import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import {
  countStoredMessageBodies,
  findStoredMessageBody
} from '../../support/database/mongo-test-store';
import { countStoredMessages, findStoredMessage } from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('POST /api/messages', () => {
  it('persists consistent metadata and body data in MySQL and Mongo', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id, {
      body: '  Consistent message body  '
    });
    const response = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      conversationId: conversation.id,
      senderId: actor.auth.user.id,
      senderName: actor.input.name,
      body: 'Consistent message body',
      createdAt: expect.any(String)
    });
    expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false);

    const storedMetadata = await findStoredMessage(
      conversation.id,
      actor.auth.user.id,
      input.clientId
    );
    const storedBody = await findStoredMessageBody(response.body.id);

    expect(storedMetadata).toMatchObject({
      id: response.body.id,
      conversationId: conversation.id,
      senderId: actor.auth.user.id,
      clientId: input.clientId,
      bodyHash: createHash('sha256').update(response.body.body).digest('hex')
    });
    expect(storedMetadata?.createdAt.toISOString()).toBe(response.body.createdAt);
    expect(storedBody).toMatchObject({
      _id: response.body.id,
      conversationId: conversation.id,
      senderId: actor.auth.user.id,
      body: response.body.body
    });
    expect(storedBody).not.toHaveProperty('signature');
    expect(storedBody?.createdAt.toISOString()).toBe(response.body.createdAt);
  });

  it.each([
    {
      name: 'an invalid conversation id',
      input: { conversationId: 0 },
      field: 'body.conversationId'
    },
    {
      name: 'an empty body',
      input: { body: '   ' },
      field: 'body.body'
    },
    {
      name: 'a body longer than 4000 characters',
      input: { body: 'a'.repeat(4001) },
      field: 'body.body'
    },
    {
      name: 'an invalid client id',
      input: { clientId: 'not-a-uuid' },
      field: 'body.clientId'
    }
  ])('rejects $name without partial writes', async ({ input, field }) => {
    const actor = await createRegisteredUser();
    const response = await actor.client.request<ApiErrorResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(1, input)
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })])
    );
    expect(await countStoredMessages()).toBe(0);
    expect(await countStoredMessageBodies()).toBe(0);
  });

  it('requires authentication without writing data', async () => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/messages', {
      method: 'POST',
      json: buildCreateMessageInput(1)
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    expect(await countStoredMessages()).toBe(0);
    expect(await countStoredMessageBodies()).toBe(0);
  });
});
