import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { seedStoredMessages } from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import type { RegisteredUserFixture } from '../../support/fixtures/registered-user';

async function sendMessage(
  actor: RegisteredUserFixture,
  conversationId: number,
  body: string
): Promise<MessageResponse> {
  const response = await actor.client.request<MessageResponse>('/api/messages', {
    method: 'POST',
    accessToken: actor.auth.accessToken,
    json: buildCreateMessageInput(conversationId, { body })
  });

  if (response.status !== 201) {
    throw new Error('Could not send message: HTTP ' + response.status);
  }

  return response.body;
}

describe('message history pagination', () => {
  it('applies the default and maximum limits', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    await seedStoredMessages(
      conversation.id,
      actor.auth.user.id,
      Array.from({ length: 35 }, (_, index) => `Message ${index + 1}`)
    );

    const defaultPage = await actor.client.request<MessageResponse[]>(
      `/api/conversations/${conversation.id}/messages`,
      { accessToken: actor.auth.accessToken }
    );
    const cappedPage = await actor.client.request<MessageResponse[]>(
      `/api/conversations/${conversation.id}/messages?limit=100`,
      { accessToken: actor.auth.accessToken }
    );
    const overLimit = await actor.client.request<ApiErrorResponse>(
      `/api/conversations/${conversation.id}/messages?limit=101`,
      { accessToken: actor.auth.accessToken }
    );

    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body).toHaveLength(30);
    expect(defaultPage.body.map(message => message.body).at(-1)).toBe('Message 35');
    expect(defaultPage.body.map(message => message.body)[0]).toBe('Message 6');
    expect(cappedPage.body).toHaveLength(35);
    expect(overLimit.status).toBe(400);
    expect(overLimit.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  it('pages backwards with beforeId without duplicates or gaps', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const sentIds = await seedStoredMessages(
      conversation.id,
      actor.auth.user.id,
      Array.from({ length: 25 }, (_, index) => `Paged ${index + 1}`)
    );

    const collected: MessageResponse[] = [];
    let beforeId: number | undefined;

    while (true) {
      const query = beforeId === undefined ? 'limit=10' : `limit=10&beforeId=${beforeId}`;
      const page = await actor.client.request<MessageResponse[]>(
        `/api/conversations/${conversation.id}/messages?${query}`,
        { accessToken: actor.auth.accessToken }
      );

      expect(page.status).toBe(200);
      if (!page.body.length) break;

      const pageIds = page.body.map(message => message.id);
      expect(pageIds).toEqual([...pageIds].sort((left, right) => left - right));

      collected.unshift(...page.body);
      beforeId = page.body[0].id;
      if (page.body.length < 10) break;
    }

    expect(collected.map(message => message.id)).toEqual(sentIds);
  });

  it('keeps pages stable while new messages arrive between requests', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const sentIds = await seedStoredMessages(
      conversation.id,
      actor.auth.user.id,
      Array.from({ length: 12 }, (_, index) => `Stable ${index + 1}`)
    );

    const firstPage = await actor.client.request<MessageResponse[]>(
      `/api/conversations/${conversation.id}/messages?limit=5`,
      { accessToken: actor.auth.accessToken }
    );

    expect(firstPage.body.map(message => message.id)).toEqual(sentIds.slice(7));

    await sendMessage(participant, conversation.id, 'Concurrent newcomer');

    const secondPage = await actor.client.request<MessageResponse[]>(
      `/api/conversations/${conversation.id}/messages?limit=5&beforeId=${firstPage.body[0].id}`,
      { accessToken: actor.auth.accessToken }
    );

    expect(secondPage.body.map(message => message.id)).toEqual(sentIds.slice(2, 7));

    const seen = new Set(firstPage.body.map(message => message.id));
    for (const message of secondPage.body) {
      expect(seen.has(message.id)).toBe(false);
    }
  });
});
