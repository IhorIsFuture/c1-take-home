import { afterAll, describe, expect, it, vi } from 'vitest';
import { sequelize } from '../../../src/db/mysql';
import { OutboxRelay } from '../../../src/outbox/outbox-relay';
import {
  findOutboxRowByEventId,
  insertOutboxRow,
  listOutboxRows
} from '../../support/database/mysql-test-store';

const hourMs = 3600000;

function createRelay(): OutboxRelay {
  return new OutboxRelay(
    { publish: vi.fn().mockResolvedValue(undefined), isReady: () => Promise.resolve(true) },
    {
      batchSize: 50,
      pollIntervalMs: 60000,
      backoffBaseSeconds: 1,
      backoffCapSeconds: 60,
      maxAttempts: 5,
      retentionHours: 72,
      cleanupIntervalMs: 3600000,
      onError: () => undefined
    }
  );
}

afterAll(async () => {
  await sequelize.close();
});

describe('outbox maintenance', () => {
  it('deletes only published rows older than the retention window', async () => {
    const oldDate = new Date(Date.now() - 100 * hourMs);
    const freshDate = new Date(Date.now() - hourMs);

    await insertOutboxRow({
      eventId: 'message.created:900001',
      eventType: 'message.created',
      messageId: 900001,
      conversationId: 900001,
      status: 'published',
      publishedAt: oldDate,
      createdAt: oldDate
    });
    await insertOutboxRow({
      eventId: 'message.created:900002',
      eventType: 'message.created',
      messageId: 900002,
      conversationId: 900002,
      status: 'published',
      publishedAt: freshDate,
      createdAt: freshDate
    });
    await insertOutboxRow({
      eventId: 'message.created:900003',
      eventType: 'message.created',
      messageId: 900003,
      conversationId: 900003,
      status: 'pending',
      availableAt: new Date(Date.now() + hourMs),
      createdAt: oldDate
    });
    await insertOutboxRow({
      eventId: 'message.created:900004',
      eventType: 'message.created',
      messageId: 900004,
      conversationId: 900004,
      status: 'failed',
      createdAt: oldDate
    });

    const deleted = await createRelay().runCleanupOnce();

    expect(deleted).toBe(1);

    const remaining = (await listOutboxRows()).map(row => row.eventId).sort();

    expect(remaining).toEqual([
      'message.created:900002',
      'message.created:900003',
      'message.created:900004'
    ]);
  });

  it('moves exhausted pending rows to the failed dead-letter state without deleting them', async () => {
    const rowId = await insertOutboxRow({
      eventId: 'message.created:900021',
      eventType: 'message.created',
      messageId: 900021,
      conversationId: 900021,
      status: 'pending',
      attempts: 5,
      availableAt: new Date(Date.now() - 1000)
    });

    await createRelay().runRelayCycleOnce();

    const row = await findOutboxRowByEventId('message.created:900021');

    expect(row?.id).toBe(rowId);
    expect(row?.status).toBe('failed');

    const deleted = await createRelay().runCleanupOnce();

    expect(deleted).toBe(0);
    expect(await findOutboxRowByEventId('message.created:900021')).not.toBeNull();
  });
});
