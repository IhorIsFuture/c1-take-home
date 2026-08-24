import type { RequestHandler } from 'express';
import { requireAuth } from '../middleware/authenticate';
import type { ValidatedHandler } from '../middleware/validate-request';
import { getCurrentUser } from '../services/auth';
import { searchUsers } from '../services/users';
import type { SearchUsersRequest } from '../validation/users';

export const currentUserHandler: RequestHandler = async (request, response) => {
  const { userId } = requireAuth(request);
  response.json(await getCurrentUser(userId));
};

export const searchUsersHandler: ValidatedHandler<SearchUsersRequest> = async (
  { query: { query, limit, offset } },
  { request, response }
) => {
  const { userId } = requireAuth(request);
  response.json(await searchUsers(userId, query, limit, offset));
};
