import express, { type Express } from 'express';
import type { ReadinessCheck } from './handlers/health';
import { errorHandler } from './middleware/error-handler';
import type { RateLimiter } from './rate-limit/redis-rate-limiter';
import type { RealtimePublisher } from './realtime/index';
import { createApiRouter } from './routes/index';
import { createHealthRouter } from './routes/health';

export interface CreateAppOptions {
  realtimePublisher: RealtimePublisher;
  rateLimiter: RateLimiter;
  checkReadiness?: ReadinessCheck;
}

const defaultReadinessCheck: ReadinessCheck = () => false;

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const checkReadiness = options.checkReadiness ?? defaultReadinessCheck;

  app.use('/health', createHealthRouter(checkReadiness));
  app.use(express.json());
  app.use(express.static('web'));
  app.use('/api', createApiRouter(options.realtimePublisher, options.rateLimiter));
  app.use(errorHandler);

  return app;
}
