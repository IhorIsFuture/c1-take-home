import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE conversation_participants
    ADD COLUMN last_read_message_id BIGINT UNSIGNED NULL,
    ADD COLUMN unread_count INT UNSIGNED NOT NULL DEFAULT 0`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE conversation_participants
    DROP COLUMN unread_count,
    DROP COLUMN last_read_message_id`);
};
