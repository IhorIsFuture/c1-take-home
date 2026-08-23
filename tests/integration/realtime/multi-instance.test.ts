import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import { TestWebSocketClient } from '../../support/clients/websocket-client';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import { testEnvironment } from '../../support/test-environment';

interface MessageFrame extends MessageResponse {
  type: 'message';
}

function isMessageFrame(frame: unknown): frame is MessageFrame {
  return !!frame && typeof frame === 'object' && 'type' in frame && frame.type === 'message';
}

describe('multi-instance realtime', () => {
  it('delivers across API instances without republishing an idempotent retry', async () => {
    const primaryActorClient = new TestHttpClient(testEnvironment.primaryBaseUrl);
    const primaryParticipantClient = new TestHttpClient(testEnvironment.primaryBaseUrl);
    const primaryOutsiderClient = new TestHttpClient(testEnvironment.primaryBaseUrl);
    const actor = await createRegisteredUser(undefined, primaryActorClient);
    const participant = await createRegisteredUser(undefined, primaryParticipantClient);
    const outsider = await createRegisteredUser(undefined, primaryOutsiderClient);
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      participant.auth.accessToken
    );
    const outsiderSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      outsider.auth.accessToken
    );
    const input = buildCreateMessageInput(conversation.id, {
      body: 'Cross-instance delivery'
    });

    try {
      const delivery = participantSocket.waitForFrame<MessageFrame>(isMessageFrame);
      const secondaryActorClient = new TestHttpClient(testEnvironment.secondaryBaseUrl);
      const created = await secondaryActorClient.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      });

      expect(created.status).toBe(201);
      await expect(delivery).resolves.toEqual({ type: 'message', ...created.body });
      await outsiderSocket.expectNoFrame(isMessageFrame);

      const repeated = await primaryActorClient.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      });

      expect(repeated.status).toBe(200);
      expect(repeated.body).toEqual(created.body);
      await participantSocket.expectNoFrame(isMessageFrame);
    } finally {
      await Promise.all([participantSocket.close(), outsiderSocket.close()]);
    }
  });
});
