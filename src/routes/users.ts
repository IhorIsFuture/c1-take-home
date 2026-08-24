import { Router } from 'express';
import { currentUserHandler, searchUsersHandler } from '../handlers/users';
import { withValidation } from '../middleware/validate-request';
import { searchUsersRequestSchema } from '../validation/users';

export const usersRouter = Router();

usersRouter.get('/me', currentUserHandler);
usersRouter.get('/', withValidation(searchUsersRequestSchema, searchUsersHandler));
