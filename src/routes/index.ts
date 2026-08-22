import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { notFoundHandler } from '../middleware/not-found-handler';
import type { RealtimePublisher } from '../realtime/index';
import { authRouter } from './auth';
import { conversationsRouter } from './conversations';
import { createMessagesRouter } from './messages';
import { searchRouter } from './search';
import { usersRouter } from './users';

export function createApiRouter(realtimePublisher: RealtimePublisher): Router {
  const apiRouter = Router();

  apiRouter.use('/auth', authRouter);
  apiRouter.use(authenticate);
  apiRouter.use('/users', usersRouter);
  apiRouter.use('/conversations', conversationsRouter);
  apiRouter.use('/messages', createMessagesRouter(realtimePublisher));
  apiRouter.use('/search', searchRouter);
  apiRouter.use(notFoundHandler);

  return apiRouter;
}
