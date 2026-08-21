import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from '../../src/db/mysql';

const dbDirectory = dirname(fileURLToPath(import.meta.url));

export const mysqlMigrator = new Umzug<QueryInterface>({
  migrations: {
    glob: join(dbDirectory, 'migrations', '[0-9]*.ts')
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize,
    modelName: 'SequelizeMeta',
    tableName: 'SequelizeMeta'
  }),
  logger: console
});

export const mysqlSeeder = new Umzug({
  migrations: {
    glob: join(dbDirectory, 'seeders', '[0-9]*.ts')
  },
  context: sequelize,
  storage: new SequelizeStorage({
    sequelize,
    modelName: 'SequelizeData',
    tableName: 'SequelizeData'
  }),
  logger: console
});

export type MysqlMigration = (typeof mysqlMigrator)['_types']['migration'];
export type MysqlSeed = (typeof mysqlSeeder)['_types']['migration'];
