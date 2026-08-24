import { z } from 'zod';
import { config } from '../config';

const legacyEnvironmentSchema = z.object({
  MONGO_URL: z.string().min(1),
  LEGACY_MIRROR_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  LEGACY_MIRROR_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(1000)
});

const environment = legacyEnvironmentSchema.parse(process.env);

if (config.nodeEnv === 'test' && config.mongoUrl !== environment.MONGO_URL) {
  throw new Error('Legacy tooling must use the isolated relay_test Mongo database');
}

export const legacyConfig = {
  mongoUrl: environment.MONGO_URL,
  mirror: {
    batchSize: environment.LEGACY_MIRROR_BATCH_SIZE,
    pollIntervalMs: environment.LEGACY_MIRROR_POLL_INTERVAL_MS
  }
};
