import type { MysqlMigration } from '../migrator';

interface MissingBodyHashCount {
  count: number | string;
}

export const up: MysqlMigration = async ({ context }) => {
  const [rows] = await context.sequelize.query(
    'SELECT COUNT(*) AS count FROM messages WHERE body_hash IS NULL'
  );
  const count = Number((rows as MissingBodyHashCount[])[0]?.count ?? 0);

  if (count) {
    throw new Error('Cannot require messages.body_hash before the body hash backfill completes');
  }

  await context.sequelize.query(`ALTER TABLE messages
    MODIFY COLUMN body_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE messages
    MODIFY COLUMN body_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL`);
};
