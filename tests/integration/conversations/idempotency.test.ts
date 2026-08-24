import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { CreatedConversation } from '../../support/contracts/conversation-contract';
import {
  countStoredConversations,
  listStoredParticipantIds
} from '../../support/database/mysql-test-store';
import { buildCreateConversationInput } from '../../support/factories/conversation-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('conversation creation idempotency', () => {
  it('returns the existing conversation for an identical retry', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const input = buildCreateConversationInput([participant.auth.user.id]);

    const firstResponse = await actor.client.request<CreatedConversation>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });
    const retryResponse = await actor.client.request<CreatedConversation>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });

    expect(firstResponse.status).toBe(201);
    expect(retryResponse.status).toBe(200);
    expect(retryResponse.body).toEqual(firstResponse.body);
    expect(await countStoredConversations()).toBe(1);
  });

  it('rejects reuse of the client id with different conversation data', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const input = buildCreateConversationInput([participant.auth.user.id]);
    const firstResponse = await actor.client.request<CreatedConversation>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });
    const conflictResponse = await actor.client.request<ApiErrorResponse>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: {
        ...input,
        title: 'Different title'
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body).toEqual({
      error: 'The idempotency key was already used with different conversation data',
      code: 'IDEMPOTENCY_KEY_REUSED'
    });
    expect(await countStoredConversations()).toBe(1);
  });

  it('creates exactly one conversation for concurrent identical requests', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const input = buildCreateConversationInput([participant.auth.user.id]);
    const requestCount = 8;
    const responses = await Promise.all(
      Array.from({ length: requestCount }, () =>
        actor.client.fork().request<CreatedConversation>('/api/conversations', {
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
    expect(await countStoredConversations()).toBe(1);
    expect(await listStoredParticipantIds(createdResponses[0]?.body.id ?? 0)).toEqual(
      [actor.auth.user.id, participant.auth.user.id].sort((left, right) => left - right)
    );
  });

  it('returns a conflict for concurrent requests with different data', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const input = buildCreateConversationInput([participant.auth.user.id]);

    const responses = await Promise.all([
      actor.client.fork().request<CreatedConversation | ApiErrorResponse>('/api/conversations', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      }),
      actor.client.fork().request<CreatedConversation | ApiErrorResponse>('/api/conversations', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: {
          ...input,
          title: 'Conflicting title'
        }
      })
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);

    const conflictResponse = responses.find(response => response.status === 409);
    expect(conflictResponse?.body).toEqual({
      error: 'The idempotency key was already used with different conversation data',
      code: 'IDEMPOTENCY_KEY_REUSED'
    });
    expect(await countStoredConversations()).toBe(1);
  });

  it('scopes the client id to the authenticated creator', async () => {
    const firstActor = await createRegisteredUser();
    const secondActor = await createRegisteredUser();
    const input = buildCreateConversationInput([secondActor.auth.user.id]);

    const firstResponse = await firstActor.client.request<CreatedConversation>(
      '/api/conversations',
      {
        method: 'POST',
        accessToken: firstActor.auth.accessToken,
        json: input
      }
    );
    const secondResponse = await secondActor.client.request<CreatedConversation>(
      '/api/conversations',
      {
        method: 'POST',
        accessToken: secondActor.auth.accessToken,
        json: {
          ...input,
          participantIds: [firstActor.auth.user.id]
        }
      }
    );

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.id).not.toBe(firstResponse.body.id);
    expect(await countStoredConversations()).toBe(2);
  });
});
