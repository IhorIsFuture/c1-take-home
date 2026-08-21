import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE messages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_id INT UNSIGNED NOT NULL,
    sender_id INT UNSIGNED NOT NULL,
    client_id VARCHAR(64) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY messages_conversation_id_id_idx (conversation_id, id),
    KEY messages_sender_id_idx (sender_id),
    CONSTRAINT messages_client_id_unique
      UNIQUE (conversation_id, sender_id, client_id),
    CONSTRAINT messages_conversation_id_fk
      FOREIGN KEY (conversation_id) REFERENCES conversations (id)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT messages_sender_id_fk
      FOREIGN KEY (sender_id) REFERENCES users (id)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('messages');
};
