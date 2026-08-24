import type { MysqlMigration } from '../migrator';

interface MaxMessageIdRow {
  maxId: number | string | null;
}

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE messages
    MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`);
};

export const down: MysqlMigration = async ({ context }) => {
  const [rows] = await context.sequelize.query('SELECT MAX(id) AS maxId FROM messages');
  const maxId = Number((rows as MaxMessageIdRow[])[0]?.maxId ?? 0);

  if (maxId > 4294967295) {
    throw new Error('Cannot narrow messages.id to INT UNSIGNED once ids exceed its range');
  }

  await context.sequelize.query(`ALTER TABLE messages
    MODIFY COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT`);
};
