import { Router } from 'express';
import { notFoundHandler } from '../middleware/not-found-handler';
import { conversationsRouter } from './conversations';
import { messagesRouter } from './messages';
import { searchRouter } from './search';

export const apiRouter = Router();

apiRouter.use('/conversations', conversationsRouter);
apiRouter.use('/messages', messagesRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use(notFoundHandler);
