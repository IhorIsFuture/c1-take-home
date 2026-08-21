import type { ValidatedHandler } from '../middleware/validate-request';
import type { SearchMessagesRequest } from '../validation/search';

export const searchMessagesHandler: ValidatedHandler<SearchMessagesRequest> = (
  { query: { q: query } },
  { response }
) => {
  if (!query) {
    response.json([]);
    return;
  }

  response.json([]);
};
