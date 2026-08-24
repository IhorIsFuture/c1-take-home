import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

interface ParticipantResponse {
  id: number;
  name: string;
  email: string;
}

describe('GET /api/conversations/:conversationId/participants', () => {
  it('lists every participant ordered by name for any member', async () => {
    const creator = await createRegisteredUser();
    const first = await createRegisteredUser();
    const second = await createRegisteredUser();
    const { conversation } = await createConversationFixture(creator, [
      first.auth.user.id,
      second.auth.user.id
    ]);

    const response = await first.client.request<ParticipantResponse[]>(
      `/api/conversations/${conversation.id}/participants`,
      { accessToken: first.auth.accessToken }
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body.map(participant => participant.id).sort((a, b) => a - b)).toEqual(
      [creator.auth.user.id, first.auth.user.id, second.auth.user.id].sort((a, b) => a - b)
    );
    expect(response.body.map(participant => participant.name)).toEqual(
      [...response.body.map(participant => participant.name)].sort()
    );
    expect(response.body[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      email: expect.any(String)
    });
  });

  it('hides the conversation from non-participants', async () => {
    const creator = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const outsider = await createRegisteredUser();
    const { conversation } = await createConversationFixture(creator, [participant.auth.user.id]);

    const response = await outsider.client.request<ApiErrorResponse>(
      `/api/conversations/${conversation.id}/participants`,
      { accessToken: outsider.auth.accessToken }
    );

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('CONVERSATION_NOT_FOUND');
  });
});
