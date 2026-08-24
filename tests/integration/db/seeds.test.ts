import { afterAll, describe, expect, it } from 'vitest';
import { sequelize } from '../../../src/db/mysql';
import * as demoDataSeed from '../../../docker/db/seeders/001-demo-data';
import * as demoPasswordSeed from '../../../docker/db/seeders/002-demo-user-passwords';
import {
  countStoredConversations,
  countStoredMessageBodyRows,
  countStoredMessages,
  countStoredUsers,
  findConversationSummary,
  findParticipantState,
  findStoredMessageBodyRow
} from '../../support/database/mysql-test-store';

afterAll(async () => {
  await sequelize.close();
});

describe('demo seeds', () => {
  it('seeds users, conversations, messages, bodies, summaries and read state', async () => {
    const seedParams = { name: 'seed', context: sequelize };

    await demoDataSeed.up(seedParams as never);
    await demoPasswordSeed.up(seedParams as never);

    expect(await countStoredUsers()).toBe(3);
    expect(await countStoredConversations()).toBe(2);
    expect(await countStoredMessages()).toBe(3);
    expect(await countStoredMessageBodyRows()).toBe(3);

    const firstBody = await findStoredMessageBodyRow(1);

    expect(firstBody).toEqual({
      messageId: 1,
      body: 'Hi, any update on order #1042?'
    });

    const firstSummary = await findConversationSummary(1);

    expect(firstSummary).toMatchObject({
      conversationId: 1,
      lastMessageId: 2,
      lastSenderId: 1,
      lastMessagePreview: 'Checking now — give me a minute.'
    });

    expect(await findParticipantState(1, 2)).toEqual({
      lastReadMessageId: 2,
      unreadCount: 0
    });
    expect(await findParticipantState(2, 3)).toEqual({
      lastReadMessageId: 3,
      unreadCount: 0
    });
  }, 60000);
});
