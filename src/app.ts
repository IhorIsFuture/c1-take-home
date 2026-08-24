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

const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const checkReadiness = options.checkReadiness ?? defaultReadinessCheck;

  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    response.set('X-Frame-Options', 'DENY');
    response.set('Referrer-Policy', 'no-referrer');
    response.set('Content-Security-Policy', contentSecurityPolicy);
    next();
  });
  app.use('/health', createHealthRouter(checkReadiness));
  app.use(express.json());
  app.use(express.static('web'));
  app.use('/api', createApiRouter(options.realtimePublisher, options.rateLimiter));
  app.use(errorHandler);

  return app;
}
