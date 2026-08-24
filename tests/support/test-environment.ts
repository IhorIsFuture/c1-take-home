import { z } from 'zod';

const testEnvironmentSchema = z.object({
  NODE_ENV: z.literal('test'),
  TEST_ENV_GUARD: z.literal('relay-test'),
  TEST_BASE_URL: z.literal('http://127.0.0.1:13000'),
  TEST_WS_URL: z.literal('ws://127.0.0.1:13000'),
  TEST_PRIMARY_BASE_URL: z.literal('http://127.0.0.1:13001'),
  TEST_PRIMARY_WS_URL: z.literal('ws://127.0.0.1:13001'),
  TEST_SECONDARY_BASE_URL: z.literal('http://127.0.0.1:13002'),
  TEST_SECONDARY_WS_URL: z.literal('ws://127.0.0.1:13002'),
  TEST_ENVOY_ADMIN_URL: z.literal('http://127.0.0.1:19902'),
  MYSQL_URL: z.literal('mysql://relay_test:relay_test@127.0.0.1:13306/relay_test?charset=utf8mb4'),
  REDIS_URL: z.literal('redis://127.0.0.1:16379/15'),
  REDIS_NAMESPACE: z.literal('relay-test'),
  JWT_ACCESS_SECRET: z.literal('relay-test-access-secret-with-at-least-32-characters'),
  JWT_ISSUER: z.literal('relay-test-api'),
  JWT_AUDIENCE: z.literal('relay-test-client')
});

const environment = testEnvironmentSchema.parse(process.env);

export const testEnvironment = {
  baseUrl: environment.TEST_BASE_URL,
  webSocketUrl: environment.TEST_WS_URL,
  primaryBaseUrl: environment.TEST_PRIMARY_BASE_URL,
  primaryWebSocketUrl: environment.TEST_PRIMARY_WS_URL,
  secondaryBaseUrl: environment.TEST_SECONDARY_BASE_URL,
  secondaryWebSocketUrl: environment.TEST_SECONDARY_WS_URL,
  envoyAdminUrl: environment.TEST_ENVOY_ADMIN_URL,
  mysqlUrl: environment.MYSQL_URL,
  redisUrl: environment.REDIS_URL,
  accessTokenSecret: environment.JWT_ACCESS_SECRET,
  accessTokenIssuer: environment.JWT_ISSUER,
  accessTokenAudience: environment.JWT_AUDIENCE
};
