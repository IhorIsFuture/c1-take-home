import { QueryTypes } from 'sequelize';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { sequelize } from '../../../src/db/mysql';
import { mysqlMigrator } from '../../../docker/db/migrator';
import { hashMessageBody } from '../../../src/services/message-body-hash';
import {
  findConversationSummary,
  findParticipantState
} from '../../support/database/mysql-test-store';

const consolidationMigrationCount = 9;
const legacyPasswordHash = '$2b$12$EmXCbJ4SnQP0Jd4OrjxWoO9bwD5qpYGz.FosBbWcupx7v8clLVUv2';

async function insertLegacyDataset(): Promise<void> {
  await sequelize.query(
    `INSERT INTO users (id, name, email, password_hash) VALUES
      (10, 'Legacy User A', 'legacy-a@example.com', '${legacyPasswordHash}'),
      (11, 'Legacy User B', 'legacy-b@example.com', '${legacyPasswordHash}')`
  );
  await sequelize.query(
    `INSERT INTO conversations (id, created_by_user_id, client_id, title, created_at)
    VALUES (20, 10, 'legacy-upgrade', 'Legacy upgrade room', '2026-01-01 00:00:00.000')`
  );
  await sequelize.query(
    `INSERT INTO conversation_participants (conversation_id, user_id) VALUES (20, 10), (20, 11)`
  );
  await sequelize.query(
    `INSERT INTO messages (id, conversation_id, sender_id, client_id, body_hash, created_at) VALUES
      (30, 20, 10, NULL, '${hashMessageBody('legacy body one')}', '2026-01-01 00:01:00.000'),
      (31, 20, 11, NULL, '${hashMessageBody('legacy body two')}', '2026-01-01 00:02:00.000')`
  );
}

async function columnType(table: string, column: string): Promise<string> {
  const rows = await sequelize.query<{ DATA_TYPE: string }>(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column }, type: QueryTypes.SELECT }
  );

  return rows[0]?.DATA_TYPE ?? 'missing';
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await sequelize.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { replacements: { table }, type: QueryTypes.SELECT }
  );

  return !!rows[0]?.count;
}

afterEach(async () => {
  delete process.env.READ_STATE_INIT;
  await mysqlMigrator.up();
});

afterAll(async () => {
  await sequelize.close();
});

describe('stage one migrations', () => {
  it('migrates a clean database from zero and produces the target schema', async () => {
    await mysqlMigrator.down({ to: 0 });
    const applied = await mysqlMigrator.up();

    expect(applied.length).toBe(18);
    expect(await columnType('messages', 'id')).toBe('bigint');
    expect(await columnType('message_bodies', 'message_id')).toBe('bigint');
    expect(await columnType('conversation_participants', 'last_read_message_id')).toBe('bigint');
    expect(await tableExists('conversation_summaries')).toBe(true);
    expect(await tableExists('message_outbox')).toBe(true);
    expect(await tableExists('message_body_backfill_state')).toBe(false);
    expect(await columnType('message_outbox', 'mirrored_at')).toBe('missing');

    const participantIndexes = await sequelize.query<{ INDEX_NAME: string }>(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversation_participants'`,
      { type: QueryTypes.SELECT }
    );

    expect(participantIndexes.map(row => row.INDEX_NAME).sort()).toEqual([
      'PRIMARY',
      'conversation_participants_user_id_idx'
    ]);
  }, 120000);

  it('upgrades a legacy database and initializes read state as history-read', async () => {
    await mysqlMigrator.down({ step: consolidationMigrationCount });
    await insertLegacyDataset();

    process.env.READ_STATE_INIT = 'history-read';
    await mysqlMigrator.up();

    expect(await findConversationSummary(20)).toEqual({
      conversationId: 20,
      lastMessageId: 31,
      lastMessageAt: new Date('2026-01-01T00:02:00.000Z'),
      lastSenderId: 11,
      lastMessagePreview: null
    });
    expect(await findParticipantState(20, 10)).toEqual({
      lastReadMessageId: 31,
      unreadCount: 0
    });
    expect(await findParticipantState(20, 11)).toEqual({
      lastReadMessageId: 31,
      unreadCount: 0
    });
  }, 120000);

  it('upgrades a legacy database and initializes read state as all-unread', async () => {
    await mysqlMigrator.down({ step: consolidationMigrationCount });
    await insertLegacyDataset();

    process.env.READ_STATE_INIT = 'all-unread';
    await mysqlMigrator.up();

    expect(await findParticipantState(20, 10)).toEqual({
      lastReadMessageId: null,
      unreadCount: 1
    });
    expect(await findParticipantState(20, 11)).toEqual({
      lastReadMessageId: null,
      unreadCount: 1
    });
  }, 120000);
});
