import { describe, expect, it } from 'vitest';
import type { ConversationSummary } from '../../support/contracts/conversation-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('GET /api/conversations/:conversationId/messages', () => {
  it('returns an empty list for a conversation without messages', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const response = await actor.client.request<MessageResponse[]>(
      `/api/conversations/${conversation.id}/messages`,
      { accessToken: actor.auth.accessToken }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns messages in ascending order with sender names', async () => {
    const creator = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(creator, [participant.auth.user.id]);
    const first = await creator.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: creator.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'First message' })
    });
    const second = await participant.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: participant.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Second message' })
    });
    const third = await creator.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: creator.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Third message' })
    });
    const response = await participant.client.request<MessageResponse[]>(
      `/api/conversations/${conversation.id}/messages`,
      { accessToken: participant.auth.accessToken }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([first.body, second.body, third.body]);
    expect(response.body.map(message => message.senderName)).toEqual([
      creator.input.name,
      participant.input.name,
      creator.input.name
    ]);
  });

  it('serves the sidebar summary with preview and per-user unread counts', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Older message' })
    });
    const latest = await participant.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: participant.auth.accessToken,
      json: buildCreateMessageInput(conversation.id, { body: 'Latest message' })
    });
    const actorList = await actor.client.request<ConversationSummary[]>('/api/conversations', {
      accessToken: actor.auth.accessToken
    });
    const participantList = await participant.client.request<ConversationSummary[]>(
      '/api/conversations',
      { accessToken: participant.auth.accessToken }
    );

    expect(actorList.status).toBe(200);
    expect(actorList.body).toEqual([
      {
        id: conversation.id,
        title: conversation.title,
        lastMessage: {
          id: latest.body.id,
          senderId: participant.auth.user.id,
          senderName: participant.input.name,
          preview: 'Latest message',
          createdAt: latest.body.createdAt
        },
        unreadCount: 1
      }
    ]);
    expect(participantList.body).toEqual([
      {
        id: conversation.id,
        title: conversation.title,
        lastMessage: actorList.body[0].lastMessage,
        unreadCount: 0
      }
    ]);
  });
});
