import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`CREATE TABLE users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(190) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT users_email_unique UNIQUE (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.dropTable('users');
};
