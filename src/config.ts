import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TEST_ENV_GUARD: z.literal('relay-test').optional(),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  MYSQL_URL: z.string().min(1).default('mysql://root:root@mysql:3306/relay?charset=utf8mb4'),
  REDIS_URL: z.string().min(1).default('redis://redis:6379'),
  REDIS_NAMESPACE: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9:_-]+$/)
    .default('relay'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(16).default(12),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().min(1).default('relay-api'),
  JWT_AUDIENCE: z.string().min(1).default('relay-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  OUTBOX_RELAY_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(1000),
  OUTBOX_RELAY_BACKOFF_BASE_SECONDS: z.coerce.number().int().min(1).default(2),
  OUTBOX_RELAY_BACKOFF_CAP_SECONDS: z.coerce.number().int().min(1).default(300),
  OUTBOX_RELAY_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  OUTBOX_RETENTION_HOURS: z.coerce.number().int().min(1).default(72),
  OUTBOX_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(1000).default(3600000)
});

const environment = environmentSchema.parse(process.env);
const exampleAccessTokenSecret = 'replace-with-at-least-32-random-characters';

function parseConnectionUrl(connectionUrl: string): URL | null {
  try {
    return new URL(connectionUrl);
  } catch {
    return null;
  }
}

function isTestMysqlUrl(connectionUrl: string): boolean {
  const url = parseConnectionUrl(connectionUrl);
  if (!url) return false;

  const isComposeEndpoint = url.hostname === 'mysql' && url.port === '3306';
  const isHostEndpoint =
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '13306';

  return (
    url.protocol === 'mysql:' &&
    url.username === 'relay_test' &&
    url.password === 'relay_test' &&
    url.pathname === '/relay_test' &&
    (isComposeEndpoint || isHostEndpoint)
  );
}

function isTestRedisUrl(connectionUrl: string): boolean {
  const url = parseConnectionUrl(connectionUrl);
  if (!url) return false;

  const isComposeEndpoint = url.hostname === 'redis' && url.port === '6379';
  const isHostEndpoint =
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port === '16379';

  return (
    url.protocol === 'redis:' &&
    !url.username &&
    !url.password &&
    url.pathname === '/15' &&
    (isComposeEndpoint || isHostEndpoint)
  );
}

if (
  environment.NODE_ENV === 'test' &&
  (environment.TEST_ENV_GUARD !== 'relay-test' ||
    !isTestMysqlUrl(environment.MYSQL_URL) ||
    !isTestRedisUrl(environment.REDIS_URL))
) {
  throw new Error('Test environment must use isolated relay_test databases');
}

if (
  environment.NODE_ENV === 'production' &&
  (!environment.JWT_ACCESS_SECRET || environment.JWT_ACCESS_SECRET === exampleAccessTokenSecret)
) {
  throw new Error('JWT_ACCESS_SECRET is required in production');
}

export const config = {
  nodeEnv: environment.NODE_ENV,
  port: environment.PORT,
  mysqlUrl: environment.MYSQL_URL,
  redisUrl: environment.REDIS_URL,
  redisNamespace: environment.REDIS_NAMESPACE,
  outbox: {
    batchSize: environment.OUTBOX_RELAY_BATCH_SIZE,
    pollIntervalMs: environment.OUTBOX_RELAY_POLL_INTERVAL_MS,
    backoffBaseSeconds: environment.OUTBOX_RELAY_BACKOFF_BASE_SECONDS,
    backoffCapSeconds: environment.OUTBOX_RELAY_BACKOFF_CAP_SECONDS,
    maxAttempts: environment.OUTBOX_RELAY_MAX_ATTEMPTS,
    retentionHours: environment.OUTBOX_RETENTION_HOURS,
    cleanupIntervalMs: environment.OUTBOX_CLEANUP_INTERVAL_MS
  },
  auth: {
    bcryptCost: environment.BCRYPT_COST,
    accessTokenSecret:
      environment.JWT_ACCESS_SECRET ?? 'relay-development-access-secret-change-before-production',
    issuer: environment.JWT_ISSUER,
    audience: environment.JWT_AUDIENCE,
    accessTokenTtlSeconds: environment.JWT_ACCESS_TTL_SECONDS,
    refreshTokenTtlSeconds: environment.REFRESH_TOKEN_TTL_SECONDS,
    refreshCookieName: 'relay_refresh',
    secureCookies: environment.NODE_ENV === 'production'
  }
};
