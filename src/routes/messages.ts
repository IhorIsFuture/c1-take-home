import { Router } from 'express';
import { createMessageHandler } from '../handlers/messages';
import { withValidation } from '../middleware/validate-request';
import type { RateLimiter } from '../rate-limit/redis-rate-limiter';
import type { RealtimePublisher } from '../realtime/index';
import { createMessageRequestSchema } from '../validation/messages';

export function createMessagesRouter(
  realtimePublisher: RealtimePublisher,
  rateLimiter: RateLimiter
): Router {
  const messagesRouter = Router();

  messagesRouter.post(
    '/',
    withValidation(createMessageRequestSchema, createMessageHandler(realtimePublisher, rateLimiter))
  );

  return messagesRouter;
}
