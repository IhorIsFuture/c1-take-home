import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE message_outbox
    DROP KEY message_outbox_mirror_idx,
    DROP COLUMN mirrored_at`);
  await context.dropTable('message_body_backfill_mismatches');
  await context.dropTable('message_body_backfill_state');
};

export const down: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE message_body_backfill_state (
    id TINYINT UNSIGNED NOT NULL,
    last_document_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    copied_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await context.sequelize.query(`CREATE TABLE message_body_backfill_mismatches (
    message_id BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(60) NOT NULL,
    detail VARCHAR(500) NULL,
    recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await context.sequelize.query(
    'INSERT INTO message_body_backfill_state (id, last_document_id, copied_count) VALUES (1, 0, 0)'
  );

  await context.sequelize.query(`ALTER TABLE message_outbox
    ADD COLUMN mirrored_at DATETIME(3) NULL AFTER published_at,
    ADD KEY message_outbox_mirror_idx (mirrored_at, id)`);
};
