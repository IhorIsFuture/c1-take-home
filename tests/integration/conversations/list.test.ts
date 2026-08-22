import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type {
  ConversationSummary,
  CreatedConversation
} from '../../support/contracts/conversation-contract';
import { buildCreateConversationInput } from '../../support/factories/conversation-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('GET /api/conversations', () => {
  it('returns an empty list when the actor has no conversations', async () => {
    const actor = await createRegisteredUser();
    const response = await actor.client.request<ConversationSummary[]>('/api/conversations', {
      accessToken: actor.auth.accessToken
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns only conversations where the actor is a participant', async () => {
    const firstActor = await createRegisteredUser();
    const secondUser = await createRegisteredUser();
    const thirdUser = await createRegisteredUser();
    const outsider = await createRegisteredUser();

    const firstConversation = await firstActor.client.request<CreatedConversation>(
      '/api/conversations',
      {
        method: 'POST',
        accessToken: firstActor.auth.accessToken,
        json: buildCreateConversationInput([secondUser.auth.user.id], {
          title: 'First shared room'
        })
      }
    );
    const secondConversation = await firstActor.client.request<CreatedConversation>(
      '/api/conversations',
      {
        method: 'POST',
        accessToken: firstActor.auth.accessToken,
        json: buildCreateConversationInput([thirdUser.auth.user.id], {
          title: 'Second shared room'
        })
      }
    );
    const outsiderConversation = await outsider.client.request<CreatedConversation>(
      '/api/conversations',
      {
        method: 'POST',
        accessToken: outsider.auth.accessToken,
        json: buildCreateConversationInput([thirdUser.auth.user.id], {
          title: 'Outsider room'
        })
      }
    );

    const firstActorList = await firstActor.client.request<ConversationSummary[]>(
      '/api/conversations',
      { accessToken: firstActor.auth.accessToken }
    );
    const secondUserList = await secondUser.client.request<ConversationSummary[]>(
      '/api/conversations',
      { accessToken: secondUser.auth.accessToken }
    );
    const thirdUserList = await thirdUser.client.request<ConversationSummary[]>(
      '/api/conversations',
      { accessToken: thirdUser.auth.accessToken }
    );

    expect(firstActorList.status).toBe(200);
    expect(firstActorList.body).toEqual([
      {
        id: firstConversation.body.id,
        title: 'First shared room',
        lastMessage: null,
        messageCount: 0
      },
      {
        id: secondConversation.body.id,
        title: 'Second shared room',
        lastMessage: null,
        messageCount: 0
      }
    ]);
    expect(secondUserList.body).toEqual([firstActorList.body[0]]);
    expect(thirdUserList.body).toEqual([
      firstActorList.body[1],
      {
        id: outsiderConversation.body.id,
        title: 'Outsider room',
        lastMessage: null,
        messageCount: 0
      }
    ]);
    expect(firstActorList.body).not.toContainEqual(
      expect.objectContaining({ id: outsiderConversation.body.id })
    );
  });

  it('requires authentication', async () => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/conversations');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
