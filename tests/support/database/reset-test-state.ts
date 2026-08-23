import { closeMongoTestStore, resetMongoTestData } from './mongo-test-store';
import { closeMysqlTestStore, resetMysqlTestData } from './mysql-test-store';
import { closeRedisTestStore, resetRedisTestData } from './redis-test-store';

export async function resetTestState(): Promise<void> {
  await Promise.all([resetMysqlTestData(), resetMongoTestData(), resetRedisTestData()]);
}

export async function closeTestStores(): Promise<void> {
  await Promise.all([closeMysqlTestStore(), closeMongoTestStore(), closeRedisTestStore()]);
}
