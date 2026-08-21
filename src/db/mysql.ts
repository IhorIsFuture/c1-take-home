import { Sequelize } from 'sequelize';
import { config } from '../config';
import { initializeSqlModels } from '../models/sql';

const retryDelayMs = 1500;

export const sequelize = new Sequelize(config.mysqlUrl, {
  dialect: 'mysql',
  logging: false
});

initializeSqlModels(sequelize);

export async function connectMysql(retries = 40): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw new Error('mysql not reachable', { cause: lastError });
}

export async function disconnectMysql(): Promise<void> {
  await sequelize.close();
}
