import type { MysqlMigration } from '../migrator';

export const up: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE message_bodies
    ADD FULLTEXT INDEX message_bodies_body_fulltext (body)`);
};

export const down: MysqlMigration = async ({ context }) => {
  await context.sequelize.query(`ALTER TABLE message_bodies
    DROP INDEX message_bodies_body_fulltext`);
};
