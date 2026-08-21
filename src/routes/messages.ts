import { Router } from 'express';
import { createMessageHandler, listMessagesHandler } from '../handlers/messages';
import { withValidation } from '../middleware/validate-request';
import { createMessageRequestSchema, listMessagesRequestSchema } from '../validation/messages';

export const messagesRouter = Router();

messagesRouter.get('/', withValidation(listMessagesRequestSchema, listMessagesHandler));
messagesRouter.post('/', withValidation(createMessageRequestSchema, createMessageHandler));
