import { Router } from 'express';
import { createConversationHandler, listConversationsHandler } from '../handlers/conversations';
import { withValidation } from '../middleware/validate-request';
import {
  createConversationRequestSchema,
  listConversationsRequestSchema
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
