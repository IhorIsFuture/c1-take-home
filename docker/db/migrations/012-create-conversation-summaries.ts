import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE conversation_summaries (
    conversation_id INT UNSIGNED NOT NULL,
    last_message_id BIGINT UNSIGNED NULL,
    last_message_at DATETIME(3) NULL,
    last_sender_id INT UNSIGNED NULL,
    last_message_preview VARCHAR(300) NULL,
    PRIMARY KEY (conversation_id),
    CONSTRAINT conversation_summaries_conversation_id_fk
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
      ON UPDATE CASCADE ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('conversation_summaries');
};
