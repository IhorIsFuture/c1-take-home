import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE conversation_participants (
    conversation_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    KEY conversation_participants_user_id_idx (user_id),
    CONSTRAINT conversation_participants_conversation_id_fk
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT conversation_participants_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users (id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('conversation_participants');
};
