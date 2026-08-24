import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import {
  countOutboxRows,
  countStoredMessageBodyRows,
  countStoredMessages,
  findParticipantState,
  findStoredMessageBodyRow,
  listStoredMessages
} from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

const idempotencyConflict = {
  error: 'Client ID has already been used with a different message body',
  code: 'MESSAGE_IDEMPOTENCY_CONFLICT'
};

describe('message creation idempotency', () => {
  it('returns the same message for an identical retry', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id);
    const firstResponse = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });
    const retryResponse = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });

    expect(firstResponse.status).toBe(201);
    expect(retryResponse.status).toBe(200);
    expect(retryResponse.body).toEqual(firstResponse.body);
    expect(await countStoredMessages()).toBe(1);
    expect(await countStoredMessageBodyRows()).toBe(1);
    expect(await countOutboxRows()).toBe(1);
    expect(await findParticipantState(conversation.id, participant.auth.user.id)).toEqual({
      lastReadMessageId: null,
      unreadCount: 1
    });
  });

  it('rejects reuse of the client id with a different body and preserves the original', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id, { body: 'Original body' });
    const firstResponse = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });
    const conflictResponse = await actor.client.request<ApiErrorResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: { ...input, body: 'Conflicting body' }
    });

    expect(firstResponse.status).toBe(201);
    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body).toEqual(idempotencyConflict);
    expect(await countStoredMessages()).toBe(1);
    expect(await countStoredMessageBodyRows()).toBe(1);
    expect((await findStoredMessageBodyRow(firstResponse.body.id))?.body).toBe('Original body');
  });

  it('scopes the client id to the sender within a conversation', async () => {
    const creator = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(creator, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id);
    const firstResponse = await creator.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: creator.auth.accessToken,
      json: input
    });
    const secondResponse = await participant.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: participant.auth.accessToken,
      json: input
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.id).not.toBe(firstResponse.body.id);
    expect(await countStoredMessages()).toBe(2);
    expect(await countStoredMessageBodyRows()).toBe(2);
  });

  it('scopes the client id to the conversation for the same sender', async () => {
    const actor = await createRegisteredUser();
    const firstParticipant = await createRegisteredUser();
    const secondParticipant = await createRegisteredUser();
    const firstConversation = await createConversationFixture(actor, [
      firstParticipant.auth.user.id
    ]);
    const secondConversation = await createConversationFixture(actor, [
      secondParticipant.auth.user.id
    ]);
    const input = buildCreateMessageInput(firstConversation.conversation.id);
    const firstResponse = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });
    const secondResponse = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: {
        ...input,
        conversationId: secondConversation.conversation.id
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.id).not.toBe(firstResponse.body.id);
    expect(await countStoredMessages()).toBe(2);
    expect(await countStoredMessageBodyRows()).toBe(2);
  });

  it('creates one cross-store message for concurrent identical requests', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id);
    const requestCount = 8;
    const responses = await Promise.all(
      Array.from({ length: requestCount }, () =>
        actor.client.fork().request<MessageResponse>('/api/messages', {
          method: 'POST',
          accessToken: actor.auth.accessToken,
          json: input
        })
      )
    );
    const createdResponses = responses.filter(response => response.status === 201);
    const replayResponses = responses.filter(response => response.status === 200);

    expect(createdResponses).toHaveLength(1);
    expect(replayResponses).toHaveLength(requestCount - 1);
    expect(responses.every(response => response.body.id === createdResponses[0]?.body.id)).toBe(
      true
    );
    expect(await countStoredMessages()).toBe(1);
    expect(await countStoredMessageBodyRows()).toBe(1);
    expect(await countOutboxRows()).toBe(1);
    expect(await findParticipantState(conversation.id, participant.auth.user.id)).toEqual({
      lastReadMessageId: null,
      unreadCount: 1
    });
  });

  it('returns one conflict for concurrent requests with different bodies', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id, { body: 'First candidate' });
    const responses = await Promise.all([
      actor.client.fork().request<MessageResponse | ApiErrorResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      }),
      actor.client.fork().request<MessageResponse | ApiErrorResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: { ...input, body: 'Second candidate' }
      })
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)?.body).toEqual(idempotencyConflict);
    expect(await countStoredMessages()).toBe(1);
    expect(await countStoredMessageBodyRows()).toBe(1);

    const [storedMetadata] = await listStoredMessages(conversation.id);
    const storedBody = await findStoredMessageBodyRow(storedMetadata?.id ?? 0);
    expect(['First candidate', 'Second candidate']).toContain(storedBody?.body);
  });
});
