import type { MysqlMigration } from '../migrator';

const disabledPasswordHash = '$2b$12$EmXCbJ4SnQP0Jd4OrjxWoO9bwD5qpYGz.FosBbWcupx7v8clLVUv2';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '${disabledPasswordHash}' AFTER email`);

  await context.sequelize.query(`ALTER TABLE users
    ALTER COLUMN password_hash DROP DEFAULT`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.removeColumn('users', 'password_hash');
};
