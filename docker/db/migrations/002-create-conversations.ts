import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE conversations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('conversations');
};
