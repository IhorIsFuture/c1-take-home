import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  MYSQL_URL: z.string().min(1).default('mysql://root:root@mysql:3306/relay?charset=utf8mb4'),
  MONGO_URL: z.string().min(1).default('mongodb://mongo:27017/relay'),
  REDIS_URL: z.string().min(1).default('redis://redis:6379'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(16).default(12),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().min(1).default('relay-api'),
  JWT_AUDIENCE: z.string().min(1).default('relay-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30)
});

const environment = environmentSchema.parse(process.env);
const exampleAccessTokenSecret = 'replace-with-at-least-32-random-characters';

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
  mongoUrl: environment.MONGO_URL,
  redisUrl: environment.REDIS_URL,
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
