import { describe, expect, it } from 'vitest';
import type { ConversationSummary } from '../../support/contracts/conversation-contract';
import type { MessageResponse } from '../../support/contracts/message-contract';
import {
  restartApiTestServices,
  startMongoTestService,
  stopMongoTestService
} from '../../support/docker/test-service';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';
import { testEnvironment } from '../../support/test-environment';

async function waitForReady(baseUrl: string, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await fetch(new URL('/health/ready', baseUrl))
      .then(response => response.ok)
      .catch(() => false);

    if (ready) return;

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`API at ${baseUrl} did not become ready`);
}

describe('SQL-only application boot', () => {
  it('starts and serves the full message flow while Mongo is completely down', async () => {
    await stopMongoTestService();

    try {
      await restartApiTestServices();
      await Promise.all([
        waitForReady(testEnvironment.primaryBaseUrl),
        waitForReady(testEnvironment.secondaryBaseUrl)
      ]);

      const actor = await createRegisteredUser();
      const participant = await createRegisteredUser();
      const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
      const created = await actor.client.request<MessageResponse>('/api/messages', {
        method: 'POST',
        accessToken: actor.auth.accessToken,
        json: buildCreateMessageInput(conversation.id, { body: 'Living without Mongo' })
      });

      expect(created.status).toBe(201);

      const history = await participant.client.request<MessageResponse[]>(
        `/api/conversations/${conversation.id}/messages`,
        { accessToken: participant.auth.accessToken }
      );

      expect(history.status).toBe(200);
      expect(history.body).toEqual([created.body]);

      const sidebar = await participant.client.request<ConversationSummary[]>(
        '/api/conversations',
        { accessToken: participant.auth.accessToken }
      );

      expect(sidebar.body).toEqual([
        {
          id: conversation.id,
          title: conversation.title,
          lastMessage: {
            id: created.body.id,
            senderId: actor.auth.user.id,
            senderName: actor.input.name,
            preview: 'Living without Mongo',
            createdAt: created.body.createdAt
          },
          unreadCount: 1
        }
      ]);
    } finally {
      await startMongoTestService();
    }
  }, 120000);
});
