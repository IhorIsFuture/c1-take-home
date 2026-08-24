import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { seedStoredMessages } from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import type { RegisteredUserFixture } from '../../support/fixtures/registered-user';

interface SearchResult {
  id: number;
  conversationId: number;
  conversationTitle: string;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
}

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

  if (response.status !== 201) throw new Error('Could not send message: HTTP ' + response.status);
  return response.body;
}

function search(actor: RegisteredUserFixture, query: string) {
  return actor.client.request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`, {
    accessToken: actor.auth.accessToken
  });
}

describe('GET /api/search', () => {
  it('finds messages by word with the full result shape', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation, input } = await createConversationFixture(actor, [
      participant.auth.user.id
    ]);
    const created = await sendMessage(actor, conversation.id, 'quarterly report is ready');
    await sendMessage(participant, conversation.id, 'thanks, downloading now');

    const response = await search(participant, 'quarterly');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: created.id,
        conversationId: conversation.id,
        conversationTitle: input.title,
        senderId: actor.auth.user.id,
        senderName: actor.input.name,
        body: 'quarterly report is ready',
        createdAt: created.createdAt
      }
    ]);
  });

  it('requires every word and supports prefix matching', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    await sendMessage(actor, conversation.id, 'alpha release notes');
    await sendMessage(actor, conversation.id, 'beta release schedule');

    const both = await search(actor, 'release');
    const prefix = await search(actor, 'sched release');
    const impossible = await search(actor, 'alpha beta');

    expect(both.body).toHaveLength(2);
    expect(prefix.body.map(result => result.body)).toEqual(['beta release schedule']);
    expect(impossible.body).toEqual([]);
  });

  it('supports Cyrillic queries', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    await sendMessage(actor, conversation.id, 'привіт світе, це пошук українською');

    const response = await search(actor, 'українськ');

    expect(response.body).toHaveLength(1);
    expect(response.body[0].body).toBe('привіт світе, це пошук українською');
  });

  it('never returns messages from conversations the user is not part of', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const outsider = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    await sendMessage(actor, conversation.id, 'confidential launch codes');

    const outsiderResponse = await search(outsider, 'confidential');
    const participantResponse = await search(participant, 'confidential');

    expect(outsiderResponse.body).toEqual([]);
    expect(participantResponse.body).toHaveLength(1);
  });

  it('returns an empty list for empty or too-short queries', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    await sendMessage(actor, conversation.id, 'ab cd searchable');

    expect((await search(actor, '')).body).toEqual([]);
    expect((await search(actor, 'ab')).body).toEqual([]);
    expect((await search(actor, 'ab cd')).body).toEqual([]);
  });

  it('caps results at the default and requested limits', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    await seedStoredMessages(
      conversation.id,
      actor.auth.user.id,
      Array.from({ length: 25 }, (_, index) => `needle haystack entry ${index + 1}`)
    );

    const defaultLimit = await search(actor, 'needle');
    const raisedLimit = await actor.client.request<SearchResult[]>(
      '/api/search?q=needle&limit=50',
      { accessToken: actor.auth.accessToken }
    );
    const invalidLimit = await actor.client.request<ApiErrorResponse>(
      '/api/search?q=needle&limit=51',
      { accessToken: actor.auth.accessToken }
    );

    expect(defaultLimit.body).toHaveLength(20);
    expect(raisedLimit.body).toHaveLength(25);
    expect(invalidLimit.status).toBe(400);
  });

  it('requires authentication', async () => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/search?q=hello');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
