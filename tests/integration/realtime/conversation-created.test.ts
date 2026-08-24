import { describe, expect, it } from 'vitest';
import { TestWebSocketClient } from '../../support/clients/websocket-client';
import type { CreatedConversation } from '../../support/contracts/conversation-contract';
import { buildCreateConversationInput } from '../../support/factories/conversation-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import { testEnvironment } from '../../support/test-environment';

interface ConversationCreatedFrame {
  type: 'conversation_created';
  id: number;
  title: string;
}

function isConversationCreatedFrame(frame: unknown): frame is ConversationCreatedFrame {
  return (
    !!frame && typeof frame === 'object' && 'type' in frame && frame.type === 'conversation_created'
  );
}

describe('conversation created realtime event', () => {
  it('notifies added participants on every instance, but not the creator, and not on replays', async () => {
    const creator = await createRegisteredUser();
    const firstParticipant = await createRegisteredUser();
    const secondParticipant = await createRegisteredUser();
    const creatorSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      creator.auth.accessToken
    );
    const firstSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      firstParticipant.auth.accessToken
    );
    const secondSocket = await TestWebSocketClient.connect(
      testEnvironment.secondaryWebSocketUrl,
      secondParticipant.auth.accessToken
    );

    try {
      const firstDelivery = firstSocket.waitForFrame<ConversationCreatedFrame>(
        isConversationCreatedFrame,
        5000
      );
      const secondDelivery = secondSocket.waitForFrame<ConversationCreatedFrame>(
        isConversationCreatedFrame,
        5000
      );
      const input = buildCreateConversationInput(
        [firstParticipant.auth.user.id, secondParticipant.auth.user.id],
        { title: 'Realtime room' }
      );
      const created = await creator.client.request<CreatedConversation>('/api/conversations', {
        method: 'POST',
        accessToken: creator.auth.accessToken,
        json: input
      });

      expect(created.status).toBe(201);
      await expect(firstDelivery).resolves.toEqual({
        type: 'conversation_created',
        id: created.body.id,
        title: 'Realtime room'
      });
      await expect(secondDelivery).resolves.toEqual({
        type: 'conversation_created',
        id: created.body.id,
        title: 'Realtime room'
      });
      await creatorSocket.expectNoFrame(isConversationCreatedFrame);

      const replay = await creator.client.request<CreatedConversation>('/api/conversations', {
        method: 'POST',
        accessToken: creator.auth.accessToken,
        json: input
      });

      expect(replay.status).toBe(200);
      await firstSocket.expectNoFrame(isConversationCreatedFrame, 500);
      await secondSocket.expectNoFrame(isConversationCreatedFrame, 500);
    } finally {
      await Promise.all([creatorSocket.close(), firstSocket.close(), secondSocket.close()]);
    }
  });
});
