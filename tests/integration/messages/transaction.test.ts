import { afterAll, describe, expect, it, vi } from 'vitest';
import { sequelize } from '../../../src/db/mysql';
import { messageBodyRepository } from '../../../src/repositories/message-body-repository';
import { createMessage } from '../../../src/services/messages';
import {
  countOutboxRows,
  countStoredMessageBodyRows,
  countStoredMessages,
  findConversationSummary,
  findParticipantState
} from '../../support/database/mysql-test-store';
import { buildCreateMessageInput } from '../../support/factories/message-factory';
import { createConversationFixture } from '../../support/fixtures/conversation';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

afterAll(async () => {
  await sequelize.close();
});

describe('createMessage transaction atomicity', () => {
  it('rolls back metadata, summary, unread and outbox when the body insert fails', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id, { body: 'Doomed body' });
    const publish = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(messageBodyRepository, 'insert').mockRejectedValue(new Error('body insert failed'));

    await expect(
      createMessage(
        actor.auth.user.id,
        { conversationId: conversation.id, body: input.body, clientId: input.clientId },
        { publish }
      )
    ).rejects.toThrow('body insert failed');

    expect(publish).not.toHaveBeenCalled();
    expect(await countStoredMessages()).toBe(0);
    expect(await countStoredMessageBodyRows()).toBe(0);
    expect(await countOutboxRows()).toBe(0);
    expect(await findConversationSummary(conversation.id)).toMatchObject({
      lastMessageId: null,
      lastMessageAt: null
    });
    expect(await findParticipantState(conversation.id, participant.auth.user.id)).toEqual({
      lastReadMessageId: null,
      unreadCount: 0
    });
  });

  it('commits everything and publishes after a successful insert', async () => {
    const actor = await createRegisteredUser();
    const participant = await createRegisteredUser();
    const { conversation } = await createConversationFixture(actor, [participant.auth.user.id]);
    const input = buildCreateMessageInput(conversation.id, { body: 'Committed body' });
    const publish = vi.fn().mockResolvedValue(undefined);

    const result = await createMessage(
      actor.auth.user.id,
      { conversationId: conversation.id, body: input.body, clientId: input.clientId },
      { publish }
    );

    expect(result.created).toBe(true);
    expect(publish).toHaveBeenCalledWith(
      { type: 'message.created', message: result.message },
      [actor.auth.user.id, participant.auth.user.id].sort((left, right) => left - right)
    );
    expect(await countStoredMessages()).toBe(1);
    expect(await countStoredMessageBodyRows()).toBe(1);
    expect(await countOutboxRows('published')).toBe(1);
  });
});
