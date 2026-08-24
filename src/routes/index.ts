import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { notFoundHandler } from '../middleware/not-found-handler';
import type { RateLimiter } from '../rate-limit/redis-rate-limiter';
import type { RealtimePublisher } from '../realtime/index';
import { createAuthRouter } from './auth';
import { createConversationsRouter } from './conversations';
import { createMessagesRouter } from './messages';
import { searchRouter } from './search';
import { usersRouter } from './users';

export function createApiRouter(
  realtimePublisher: RealtimePublisher,
  rateLimiter: RateLimiter
): Router {
  const apiRouter = Router();

  apiRouter.use('/auth', createAuthRouter(rateLimiter));
  apiRouter.use(authenticate);
  apiRouter.use('/users', usersRouter);
  apiRouter.use('/conversations', createConversationsRouter(realtimePublisher));
  apiRouter.use('/messages', createMessagesRouter(realtimePublisher, rateLimiter));
  apiRouter.use('/search', searchRouter);
  apiRouter.use(notFoundHandler);

  return apiRouter;
}
