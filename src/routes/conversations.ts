import { Router } from 'express';
import {
  createConversationHandler,
  listConversationMessagesHandler,
  listConversationsHandler,
  markConversationReadHandler
} from '../handlers/conversations';
import { withValidation } from '../middleware/validate-request';
import {
  createConversationRequestSchema,
  listConversationMessagesRequestSchema,
  listConversationsRequestSchema,
  markConversationReadRequestSchema
} from '../validation/conversations';

export const conversationsRouter = Router();

conversationsRouter.get(
  '/',
  withValidation(listConversationsRequestSchema, listConversationsHandler)
);
conversationsRouter.post(
  '/',
  withValidation(createConversationRequestSchema, createConversationHandler)
);
conversationsRouter.get(
  '/:conversationId/messages',
  withValidation(listConversationMessagesRequestSchema, listConversationMessagesHandler)
);
conversationsRouter.post(
  '/:conversationId/read',
  withValidation(markConversationReadRequestSchema, markConversationReadHandler)
);
