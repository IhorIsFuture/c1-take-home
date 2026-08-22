import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE conversations
    ADD COLUMN created_by_user_id INT UNSIGNED NULL AFTER id,
    ADD COLUMN client_id VARCHAR(64) NULL AFTER created_by_user_id`);

  await context.sequelize.query(`UPDATE conversations AS conversation
    SET created_by_user_id = (
      SELECT MIN(participant.user_id)
      FROM conversation_participants AS participant
      WHERE participant.conversation_id = conversation.id
    ),
    client_id = CONCAT('legacy-', conversation.id)`);

  await context.sequelize.query(`ALTER TABLE conversations
    MODIFY COLUMN created_by_user_id INT UNSIGNED NOT NULL,
    MODIFY COLUMN client_id VARCHAR(64) NOT NULL,
    ADD CONSTRAINT conversations_creator_client_id_unique
      UNIQUE (created_by_user_id, client_id),
    ADD KEY conversations_created_by_user_id_idx (created_by_user_id),
    ADD CONSTRAINT conversations_created_by_user_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users (id)
      ON UPDATE CASCADE ON DELETE RESTRICT`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE conversations
    DROP FOREIGN KEY conversations_created_by_user_id_fk,
    DROP INDEX conversations_created_by_user_id_idx,
    DROP INDEX conversations_creator_client_id_unique,
    DROP COLUMN client_id,
    DROP COLUMN created_by_user_id`);
};
