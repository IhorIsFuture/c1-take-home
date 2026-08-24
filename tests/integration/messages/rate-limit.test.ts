import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { countOutboxRows, countStoredMessages } from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import type { RegisteredUserFixture } from '../../support/fixtures/registered-user';
import { testEnvironment } from '../../support/test-environment';

const limit = 5;
const windowSeconds = 10;

async function send(
  actor: RegisteredUserFixture,
  conversationId: number,
  client = actor.client
): Promise<{
  status: number;
  retryAfter: number | null;
  body: MessageResponse | ApiErrorResponse;
}> {
  const response = await client.request<MessageResponse | ApiErrorResponse>('/api/messages', {
    method: 'POST',
    accessToken: actor.auth.accessToken,
    json: buildCreateMessageInput(conversationId)
  });

  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after')
      ? Number(response.headers.get('retry-after'))
      : null,
    body: response.body
  };
}

describe('message creation rate limiting', () => {
  it('allows the configured burst and rejects the next send with 429 and Retry-After', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    for (let index = 0; index < limit; index += 1) {
      expect((await send(actor, conversation.id)).status).toBe(201);
    }

    const throttled = await send(actor, conversation.id);

    expect(throttled.status).toBe(429);
    expect((throttled.body as ApiErrorResponse).code).toBe('RATE_LIMITED');
    expect(throttled.retryAfter).toBeGreaterThanOrEqual(1);
    expect(throttled.retryAfter).toBeLessThanOrEqual(windowSeconds);
    expect(await countStoredMessages()).toBe(limit);
    expect(await countOutboxRows()).toBe(limit);
  });

  it('does not throttle other participants of the same conversation', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    for (let index = 0; index < limit; index += 1) {
      expect((await send(actor, conversation.id)).status).toBe(201);
    }

    expect((await send(actor, conversation.id)).status).toBe(429);
    expect((await send(participant, conversation.id)).status).toBe(201);
  });

  it('scopes the limit to a single conversation', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const first = await createConversationFixture(actor, [participant.auth.user.id]);
    const second = await createConversationFixture(actor, [participant.auth.user.id]);

    for (let index = 0; index < limit; index += 1) {
      expect((await send(actor, first.conversation.id)).status).toBe(201);
    }

    expect((await send(actor, first.conversation.id)).status).toBe(429);
    expect((await send(actor, second.conversation.id)).status).toBe(201);
  });

  it('enforces one shared window across API instances', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const primaryClient = new TestHttpClient(testEnvironment.primaryBaseUrl);
    const secondaryClient = new TestHttpClient(testEnvironment.secondaryBaseUrl);

    for (let index = 0; index < limit; index += 1) {
      const client = index % 2 === 0 ? primaryClient : secondaryClient;
      expect((await send(actor, conversation.id, client)).status).toBe(201);
    }

    expect((await send(actor, conversation.id, primaryClient)).status).toBe(429);
    expect((await send(actor, conversation.id, secondaryClient)).status).toBe(429);
  });

  it('lets the sender continue after waiting for Retry-After', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);

    for (let index = 0; index < limit; index += 1) {
      expect((await send(actor, conversation.id)).status).toBe(201);
    }

    const throttled = await send(actor, conversation.id);

    expect(throttled.status).toBe(429);
    await new Promise(resolve =>
      setTimeout(resolve, (throttled.retryAfter ?? windowSeconds) * 1000 + 300)
    );
    expect((await send(actor, conversation.id)).status).toBe(201);
  }, 25000);
});
