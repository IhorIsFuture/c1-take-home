import { createClient } from 'redis';
import { testEnvironment } from '../test-environment';

const client = createClient({ url: testEnvironment.redisUrl });

client.on('error', error => console.error('Redis test store error', error));

async function getClient() {
  if (!client.isOpen) await client.connect();
  return client;
}

export async function resetRedisTestData(): Promise<void> {
  await (await getClient()).flushDb();
}

export async function closeRedisTestStore(): Promise<void> {
  if (!client.isOpen) return;
  await client.quit();
}
