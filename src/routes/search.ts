import { Router } from 'express';
import { searchMessagesHandler } from '../handlers/search';
import { withValidation } from '../middleware/validate-request';
import { searchMessagesRequestSchema } from '../validation/search';

export const searchRouter = Router();

searchRouter.get('/', withValidation(searchMessagesRequestSchema, searchMessagesHandler));
