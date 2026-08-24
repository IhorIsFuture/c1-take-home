import { requireAuth } from '../middleware/authenticate';
import type { ValidatedHandler } from '../middleware/validate-request';
import { searchMessages } from '../services/search';
import type { SearchMessagesRequest } from '../validation/search';

export const searchMessagesHandler: ValidatedHandler<SearchMessagesRequest> = async (
  { query: { q: query, limit } },
  { request, response }
) => {
  const { userId } = requireAuth(request);
  response.json(await searchMessages(userId, query, limit));
};
