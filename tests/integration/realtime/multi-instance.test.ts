import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import { TestWebSocketClient } from '../../support/clients/websocket-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { startRedisTestService, stopRedisTestService } from '../../support/docker/test-service';
import { createAccessTokenExpiringIn } from '../../support/factories/access-token-factory';
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

function hasFrameType(type: string): (frame: unknown) => boolean {
  return frame => !!frame && typeof frame === 'object' && 'type' in frame && frame.type === type;
}

async function waitForReady(baseUrl: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await fetch(new URL('/health/ready', baseUrl))
      .then(response => response.ok)
      .catch(() => false);

    if (ready) return;

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`API at ${baseUrl} did not become ready`);
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
    const secondaryParticipantSocket = await TestWebSocketClient.connect(
      testEnvironment.secondaryWebSocketUrl,
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
      const secondaryDelivery =
        secondaryParticipantSocket.waitForFrame<MessageFrame>(isMessageFrame);
      const secondaryActorClient = new TestHttpClient(testEnvironment.secondaryBaseUrl);
      const created = await secondaryActorClient.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      });

      expect(created.status).toBe(201);
      await expect(delivery).resolves.toEqual({ type: 'message', ...created.body });
      await expect(secondaryDelivery).resolves.toEqual({ type: 'message', ...created.body });
      await outsiderSocket.expectNoFrame(isMessageFrame);

      const repeated = await primaryActorClient.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      });

      expect(repeated.status).toBe(200);
      expect(repeated.body).toEqual(created.body);
      await participantSocket.expectNoFrame(isMessageFrame);
      await secondaryParticipantSocket.expectNoFrame(isMessageFrame);
    } finally {
      await Promise.all([
        participantSocket.close(),
        secondaryParticipantSocket.close(),
        outsiderSocket.close()
      ]);
    }
  });

  it('requests state resynchronization after the Redis subscriber recovers', async () => {
    const actor = await createRegisteredUser(
      undefined,
      new TestHttpClient(testEnvironment.primaryBaseUrl)
    );
    const participant = await createRegisteredUser(
      undefined,
      new TestHttpClient(testEnvironment.primaryBaseUrl)
    );
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      participant.auth.accessToken
    );
    let redisStopped = false;

    try {
      const unavailable = participantSocket.waitForFrame(
        hasFrameType('realtime_unavailable'),
        10000
      );
      await stopRedisTestService();
      redisStopped = true;
      await expect(unavailable).resolves.toEqual({ type: 'realtime_unavailable' });

      const input = buildCreateMessageInput(conversation.id, {
        body: 'Persisted while realtime was unavailable'
      });
      const failedPublish = await new TestHttpClient(
        testEnvironment.secondaryBaseUrl
      ).request<ApiErrorResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: input
      });

      expect(failedPublish.status).toBe(500);

      const resyncRequired = participantSocket.waitForFrame(hasFrameType('resync_required'), 10000);
      await startRedisTestService();
      redisStopped = false;
      await expect(resyncRequired).resolves.toEqual({ type: 'resync_required' });
      await Promise.all([
        waitForReady(testEnvironment.primaryBaseUrl),
        waitForReady(testEnvironment.secondaryBaseUrl)
      ]);

      const messages = await actor.client.request<MessageResponse[]>(
        `/api/messages?conversationId=${conversation.id}`,
        { accessToken: actor.auth.accessToken }
      );

      expect(messages.status).toBe(200);
      expect(messages.body).toEqual([
        expect.objectContaining({
          conversationId: conversation.id,
          body: input.body
        })
      ]);
      await participantSocket.expectNoFrame(isMessageFrame);
    } finally {
      if (redisStopped) await startRedisTestService();
      await participantSocket.close();
    }
  }, 30000);

  it('closes an authenticated socket when its access token expires', async () => {
    const user = await createRegisteredUser();
    const accessToken = await createAccessTokenExpiringIn(user.auth.user.id, 2);
    const socket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      accessToken
    );

    try {
      const authError = socket.waitForFrame<{ type: string; code: string }>(
        hasFrameType('auth_error'),
        5000
      );
      const closed = socket.waitForClose(5000);

      await expect(authError).resolves.toEqual({
        type: 'auth_error',
        code: 'ACCESS_TOKEN_EXPIRED'
      });
      await expect(closed).resolves.toEqual({
        code: 4001,
        reason: 'Access token expired'
      });
    } finally {
      await socket.close();
    }
  });
});
