import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type {
  ConversationReadState,
  ConversationSummary
} from '../../support/contracts/conversation-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { findParticipantState } from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('POST /api/conversations/:conversationId/read', () => {
  it('does not count the sender as unread and advances the sender cursor on send', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const message = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });

    expect(message.status).toBe(201);
    expect(await findParticipantState(conversation.id, actor.auth.user.id)).toEqual({
      lastReadMessageId: message.body.id,
      unreadCount: 0
    });
    expect(await findParticipantState(conversation.id, participant.auth.user.id)).toEqual({
      lastReadMessageId: null,
      unreadCount: 1
    });
  });

  it('increments other participants exactly once even for an idempotent retry', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await actor.client.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      });
    }

    expect(await findParticipantState(conversation.id, participant.auth.user.id)).toEqual({
      lastReadMessageId: null,
      unreadCount: 1
    });
  });

  it('marks a conversation read and refuses to move the cursor backwards', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const first = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });
    const second = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });

    const readLatest = await participant.client.request<ConversationReadState>(
      `/api/conversations/${conversation.id}/read`,
      {
        method: 'POST',
        accessToken: participant.auth.accessToken,
        json: { throughMessageId: second.body.id }
      }
    );

    expect(readLatest.status).toBe(200);
    expect(readLatest.body).toEqual({
      conversationId: conversation.id,
      lastReadMessageId: second.body.id,
      unreadCount: 0
    });

    const readOlder = await participant.client.request<ConversationReadState>(
      `/api/conversations/${conversation.id}/read`,
      {
        method: 'POST',
        accessToken: participant.auth.accessToken,
        json: { throughMessageId: first.body.id }
      }
    );

    expect(readOlder.status).toBe(200);
    expect(readOlder.body).toEqual({
      conversationId: conversation.id,
      lastReadMessageId: second.body.id,
      unreadCount: 0
    });

    const repeat = await participant.client.request<ConversationReadState>(
      `/api/conversations/${conversation.id}/read`,
      {
        method: 'POST',
        accessToken: participant.auth.accessToken,
        json: { throughMessageId: second.body.id }
      }
    );

    expect(repeat.body).toEqual(readLatest.body);
  });

  it('keeps the unread count exact when mark-read races a new message', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const existing = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });

    const [markRead, created] = await Promise.all([
      participant.client
        .fork()
        .request<ConversationReadState>(`/api/conversations/${conversation.id}/read`, {
          method: 'POST',
          accessToken: participant.auth.accessToken,
          json: { throughMessageId: existing.body.id }
        }),
      actor.client.fork().request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: buildCreateMessageInput(conversation.id)
      })
    ]);

    expect(markRead.status).toBe(200);
    expect(created.status).toBe(201);

    const finalState = await findParticipantState(conversation.id, participant.auth.user.id);

    expect(finalState).toEqual({
      lastReadMessageId: existing.body.id,
      unreadCount: 1
    });
  });

  it('exposes the persistent unread count in the sidebar after a reload', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });
    const latest = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(conversation.id)
    });

    const before = await participant.client.request<ConversationSummary[]>('/api/conversations', {
      accessToken: participant.auth.accessToken
    });

    expect(before.body[0].unreadCount).toBe(2);

    await participant.client.request<ConversationReadState>(
      `/api/conversations/${conversation.id}/read`,
      {
        method: 'POST',
        accessToken: participant.auth.accessToken,
        json: { throughMessageId: latest.body.id }
      }
    );

    const after = await participant.client.request<ConversationSummary[]>('/api/conversations', {
      accessToken: participant.auth.accessToken
    });

    expect(after.body[0].unreadCount).toBe(0);
  });

  it('rejects a message from another conversation and hides foreign conversations', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const outsider = await createRegisteredUser();
    const first = await createConversationFixture(actor, [participant.auth.user.id]);
    const second = await createConversationFixture(actor, [participant.auth.user.id]);
    const foreignMessage = await actor.client.request<MessageResponse>('/api/messages', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateMessageInput(second.conversation.id)
    });

    const wrongConversation = await participant.client.request<ApiErrorResponse>(
      `/api/conversations/${first.conversation.id}/read`,
      {
        method: 'POST',
        accessToken: participant.auth.accessToken,
        json: { throughMessageId: foreignMessage.body.id }
      }
    );

    expect(wrongConversation.status).toBe(404);
    expect(wrongConversation.body.code).toBe('MESSAGE_NOT_FOUND');

    const outsiderResponse = await outsider.client.request<ApiErrorResponse>(
      `/api/conversations/${first.conversation.id}/read`,
      {
        method: 'POST',
        accessToken: outsider.auth.accessToken,
        json: { throughMessageId: foreignMessage.body.id }
      }
    );

    expect(outsiderResponse.status).toBe(404);
    expect(outsiderResponse.body.code).toBe('CONVERSATION_NOT_FOUND');
  });
});
