import { describe, expect, it } from 'vitest';
import { TestWebSocketClient } from '../../support/clients/websocket-client';
import type { MessageResponse } from '../../support/contracts/message-contract';
import { findOutboxRowByEventId, updateOutboxRow } from '../../support/database/mysql-test-store';
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

describe('outbox redelivery deduplication', () => {
  it('does not deliver a duplicate realtime message when a published event is retried', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const participantSocket = await TestWebSocketClient.connect(
      testEnvironment.primaryWebSocketUrl,
      participant.auth.accessToken
    );

    try {
      const delivery = participantSocket.waitForFrame<MessageFrame>(isMessageFrame, 5000);
      const created = await actor.client.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: buildCreateMessageInput(conversation.id)
      });

      expect(created.status).toBe(201);
      await expect(delivery).resolves.toEqual({ type: 'message', ...created.body });

      const eventId = `message.created:${created.body.id}`;
      const publishedRow = await findOutboxRowByEventId(eventId);

      expect(publishedRow?.status).toBe('published');

      await updateOutboxRow(publishedRow!.id, {
        status: 'pending',
        publishedAt: null,
        availableAt: new Date(Date.now() - 1000)
      });

      await participantSocket.expectNoFrame(isMessageFrame, 2000);

      const deadline = Date.now() + 5000;
      let retriedRow = await findOutboxRowByEventId(eventId);

      while (retriedRow?.status !== 'published' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 200));
        retriedRow = await findOutboxRowByEventId(eventId);
      }

      expect(retriedRow?.status).toBe('published');
    } finally {
      await participantSocket.close();
    }
  }, 20000);
});
