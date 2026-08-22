import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { notFoundHandler } from '../middleware/not-found-handler';
import { authRouter } from './auth';
import { conversationsRouter } from './conversations';
import { messagesRouter } from './messages';
import { searchRouter } from './search';
import { usersRouter } from './users';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use(authenticate);
apiRouter.use('/users', usersRouter);
apiRouter.use('/conversations', conversationsRouter);
apiRouter.use('/messages', messagesRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use(notFoundHandler);
