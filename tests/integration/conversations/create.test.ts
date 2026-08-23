import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { CreatedConversation } from '../../support/contracts/conversation-contract';
import {
  findStoredConversation,
  listStoredParticipantIds
} from '../../support/database/mysql-test-store';
import { buildCreateConversationInput } from '../../support/factories/conversation-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('POST /api/conversations', () => {
  it('creates a conversation, normalizes participants and persists the creator', async () => {
    const actor = await createRegisteredUser();
    const second = await createRegisteredUser();
    const third = await createRegisteredUser();
    const input = buildCreateConversationInput(
      [third.auth.user.id, actor.auth.user.id, second.auth.user.id, second.auth.user.id],
      { title: '  Integration Room  ' }
    );
    const response = await actor.client.request<CreatedConversation>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: input
    });
    const expectedParticipantIds = [
      actor.auth.user.id,
      second.auth.user.id,
      third.auth.user.id
    ].sort((left, right) => left - right);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      title: 'Integration Room',
      participantIds: expectedParticipantIds
    });

    const storedConversation = await findStoredConversation(actor.auth.user.id, input.clientId);
    expect(storedConversation).toMatchObject({
      id: response.body.id,
      createdByUserId: actor.auth.user.id,
      clientId: input.clientId,
      title: 'Integration Room'
    });
    expect(await listStoredParticipantIds(response.body.id)).toEqual(expectedParticipantIds);
  });

  it('requires at least one participant other than the actor', async () => {
    const actor = await createRegisteredUser();
    const response = await actor.client.request<ApiErrorResponse>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateConversationInput([actor.auth.user.id])
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'A conversation must include at least one other participant',
      code: 'PARTICIPANT_REQUIRED'
    });
  });

  it('reports all participant ids that do not exist', async () => {
    const actor = await createRegisteredUser();
    const missingParticipantIds = [999998, 999999];
    const response = await actor.client.request<ApiErrorResponse>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildCreateConversationInput(missingParticipantIds)
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'One or more participants do not exist',
      code: 'PARTICIPANTS_NOT_FOUND',
      details: {
        participantIds: missingParticipantIds
      }
    });
  });

  it.each([
    {
      name: 'an empty participant list',
      buildInput: () => buildCreateConversationInput([]),
      field: 'body.participantIds'
    },
    {
      name: 'an invalid client id',
      buildInput: () =>
        buildCreateConversationInput([1], {
          clientId: 'not-a-uuid'
        }),
      field: 'body.clientId'
    },
    {
      name: 'an empty title',
      buildInput: () =>
        buildCreateConversationInput([1], {
          title: '   '
        }),
      field: 'body.title'
    }
  ])('rejects $name during request validation', async ({ buildInput, field }) => {
    const actor = await createRegisteredUser();
    const response = await actor.client.request<ApiErrorResponse>('/api/conversations', {
      method: 'POST',
      accessToken: actor.auth.accessToken,
      json: buildInput()
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })])
    );
  });
});
