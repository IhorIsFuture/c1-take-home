import { describe, expect, it } from 'vitest';
import { TestWebSocketClient } from '../../support/clients/websocket-client';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import { testEnvironment } from '../../support/test-environment';

interface TypingFrame {
  type: 'typing';
  conversationId: number;
  userId: number;
  userName: string;
}

function isTypingFrame(frame: unknown): frame is TypingFrame {
  return !!frame && typeof frame === 'object' && 'type' in frame && frame.type === 'typing';
}

describe('typing indicator', () => {
  it('notifies other participants but never the author', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const actorSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      actor.auth.accessToken
    );
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      participant.auth.accessToken
    );

    try {
      const delivery = participantSocket.waitForFrame<TypingFrame>(isTypingFrame, 5000);
      actorSocket.send({ type: 'typing', conversationId: conversation.id });

      await expect(delivery).resolves.toEqual({
        type: 'typing',
        conversationId: conversation.id,
        userId: actor.auth.user.id,
        userName: actor.input.name
      });
      await actorSocket.expectNoFrame(isTypingFrame);
    } finally {
      await Promise.all([actorSocket.close(), participantSocket.close()]);
    }
  });

  it('reaches participants connected to another API instance', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const actorSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      actor.auth.accessToken
    );
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.secondaryWebSocketUrl,
      participant.auth.accessToken
    );

    try {
      const delivery = participantSocket.waitForFrame<TypingFrame>(isTypingFrame, 5000);
      actorSocket.send({ type: 'typing', conversationId: conversation.id });

      await expect(delivery).resolves.toMatchObject({
        conversationId: conversation.id,
        userId: actor.auth.user.id
      });
    } finally {
      await Promise.all([actorSocket.close(), participantSocket.close()]);
    }
  });

  it('silently ignores typing for conversations the sender is not part of', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const outsider = await createRegisteredUser();
    const foreign = await createConversationFixture(actor, [participant.auth.user.id]);
    const own = await createConversationFixture(outsider, [participant.auth.user.id]);
    const outsiderSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      outsider.auth.accessToken
    );
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      participant.auth.accessToken
    );

    try {
      outsiderSocket.send({ type: 'typing', conversationId: foreign.conversation.id });
      await participantSocket.expectNoFrame(isTypingFrame, 500);

      const delivery = participantSocket.waitForFrame<TypingFrame>(isTypingFrame, 5000);
      outsiderSocket.send({ type: 'typing', conversationId: own.conversation.id });

      await expect(delivery).resolves.toMatchObject({
        conversationId: own.conversation.id,
        userId: outsider.auth.user.id
      });
    } finally {
      await Promise.all([outsiderSocket.close(), participantSocket.close()]);
    }
  });

  it('throttles rapid typing frames from the same socket', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const actorSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      actor.auth.accessToken
    );
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      participant.auth.accessToken
    );

    try {
      const firstDelivery = participantSocket.waitForFrame<TypingFrame>(isTypingFrame, 5000);
      actorSocket.send({ type: 'typing', conversationId: conversation.id });
      actorSocket.send({ type: 'typing', conversationId: conversation.id });
      actorSocket.send({ type: 'typing', conversationId: conversation.id });

      await firstDelivery;
      await participantSocket.expectNoFrame(isTypingFrame, 600);
    } finally {
      await Promise.all([actorSocket.close(), participantSocket.close()]);
    }
  });

  it('still rejects unknown frames after authentication', async () => {
    const actor = await createRegisteredUser();
    const socket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      actor.auth.accessToken
    );

    try {
      const protocolError = socket.waitForFrame<{ type: string; code: string }>(
        frame =>
          !!frame &&
          typeof frame === 'object' &&
          'type' in frame &&
          frame.type === 'protocol_error',
        5000
      );
      const closed = socket.waitForClose(5000);
      socket.send({ type: 'subscribe', conversationIds: [1] });

      await expect(protocolError).resolves.toEqual({
        type: 'protocol_error',
        code: 'UNEXPECTED_FRAME'
      });
      await expect(closed).resolves.toMatchObject({ code: 1008 });
    } finally {
      await socket.close();
    }
  });
});
