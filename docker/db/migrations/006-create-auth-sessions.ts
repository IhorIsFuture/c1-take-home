import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE auth_sessions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    refresh_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    revoked_at DATETIME(3) NULL,
    replaced_by_session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_used_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    CONSTRAINT auth_sessions_refresh_token_hash_unique UNIQUE (refresh_token_hash),
    KEY auth_sessions_user_status_idx (user_id, revoked_at, expires_at),
    KEY auth_sessions_expires_at_idx (expires_at),
    KEY auth_sessions_replaced_by_session_id_idx (replaced_by_session_id),
    CONSTRAINT auth_sessions_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users (id)
      ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT auth_sessions_replaced_by_session_id_fk
      FOREIGN KEY (replaced_by_session_id) REFERENCES auth_sessions (id)
      ON UPDATE CASCADE ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('auth_sessions');
};
