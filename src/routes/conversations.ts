import { Router } from 'express';
import {
  createConversationHandler,
  listConversationMessagesHandler,
  listConversationParticipantsHandler,
  listConversationsHandler,
  markConversationReadHandler
} from '../handlers/conversations';
import { withValidation } from '../middleware/validate-request';
import type { RealtimePublisher } from '../realtime/index';
import {
  createConversationRequestSchema,
  listConversationMessagesRequestSchema,
  listConversationParticipantsRequestSchema,
  listConversationsRequestSchema,
  markConversationReadRequestSchema
} from '../validation/conversations';

export function createConversationsRouter(realtimePublisher: RealtimePublisher): Router {
  const conversationsRouter = Router();

  conversationsRouter.get(
    '/',
    withValidation(listConversationsRequestSchema, listConversationsHandler)
  );
  conversationsRouter.post(
    '/',
    withValidation(createConversationRequestSchema, createConversationHandler(realtimePublisher))
  );
  conversationsRouter.get(
    '/:conversationId/messages',
    withValidation(listConversationMessagesRequestSchema, listConversationMessagesHandler)
  );
  conversationsRouter.post(
    '/:conversationId/read',
    withValidation(markConversationReadRequestSchema, markConversationReadHandler)
  );
  conversationsRouter.get(
    '/:conversationId/participants',
    withValidation(listConversationParticipantsRequestSchema, listConversationParticipantsHandler)
  );

  return conversationsRouter;
}
