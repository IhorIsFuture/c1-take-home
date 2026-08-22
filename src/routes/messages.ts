import { Router } from 'express';
import { createMessageHandler, listMessagesHandler } from '../handlers/messages';
import { withValidation } from '../middleware/validate-request';
import type { RealtimePublisher } from '../realtime/index';
import { createMessageRequestSchema, listMessagesRequestSchema } from '../validation/messages';

export function createMessagesRouter(realtimePublisher: RealtimePublisher): Router {
  const messagesRouter = Router();

  messagesRouter.get('/', withValidation(listMessagesRequestSchema, listMessagesHandler));
  messagesRouter.post(
    '/',
    withValidation(createMessageRequestSchema, createMessageHandler(realtimePublisher))
  );

  return messagesRouter;
}
