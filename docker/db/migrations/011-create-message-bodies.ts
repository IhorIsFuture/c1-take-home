import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE message_bodies (
    message_id BIGINT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (message_id),
    CONSTRAINT message_bodies_message_id_fk
      FOREIGN KEY (message_id) REFERENCES messages (id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('message_bodies');
};
