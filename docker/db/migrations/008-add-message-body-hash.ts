import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE messages
    ADD COLUMN body_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER client_id`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.removeColumn('messages', 'body_hash');
};
