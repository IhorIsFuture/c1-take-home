import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { countStoredMessageBodies } from '../../support/database/mongo-test-store';
import { countStoredMessages } from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

const hiddenConversationError = {
  error: 'Conversation not found',
  code: 'CONVERSATION_NOT_FOUND'
};

describe('message access control', () => {
  it('allows every participant to create and read messages', async () => {
    const creator = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(creator, [participant.auth.user.id]);
    const response = await participant.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: participant.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });
    const creatorList = await creator.client.request<MessageResponse[]>(
      '/api/messages?conversationId=' + conversation.id,
      { accessToken: creator.auth.accessToken }
    );
    const participantList = await participant.client.request<MessageResponse[]>(
      '/api/messages?conversationId=' + conversation.id,
      { accessToken: participant.auth.accessToken }
    );

    expect(response.status).toBe(201);
    expect(response.body.senderName).toBe(participant.input.name);
    expect(creatorList.status).toBe(200);
    expect(participantList.status).toBe(200);
    expect(creatorList.body).toEqual([response.body]);
    expect(participantList.body).toEqual([response.body]);
  });

  it('hides an existing conversation from a non-participant', async () => {
    const creator = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const outsider = await createRegisteredUser();
    const { conversation } = await createConversationFixture(creator, [participant.auth.user.id]);
    const createResponse = await outsider.client.request<ApiErrorResponse>('/api/messages', {
      method: 'POST',
      accessToken: outsider.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });
    const listResponse = await outsider.client.request<ApiErrorResponse>(
      '/api/messages?conversationId=' + conversation.id,
      { accessToken: outsider.auth.accessToken }
    );

    expect(createResponse.status).toBe(404);
    expect(createResponse.body).toEqual(hiddenConversationError);
    expect(listResponse.status).toBe(404);
    expect(listResponse.body).toEqual(hiddenConversationError);
    expect(await countStoredMessages()).toBe(0);
    expect(await countStoredMessageBodies()).toBe(0);
  });

  it('returns the same hidden response for a conversation that does not exist', async () => {
    const actor = await createRegisteredUser();
    const conversationId = 999_999;
    const createResponse = await actor.client.request<ApiErrorResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversationId)
    });
    const listResponse = await actor.client.request<ApiErrorResponse>(
      '/api/messages?conversationId=' + conversationId,
      { accessToken: actor.auth.accessToken }
    );

    expect(createResponse.status).toBe(404);
    expect(createResponse.body).toEqual(hiddenConversationError);
    expect(listResponse.status).toBe(404);
    expect(listResponse.body).toEqual(hiddenConversationError);
  });
});
