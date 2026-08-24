import {
  messageSearchRepository,
  type MessageSearchResult
} from '../repositories/message-search-repository';

const minTokenLength = 3;
const maxTokens = 10;

export function buildBooleanQuery(query: string): string | null {
  const tokens = query
    .split(/\s+/)
    .map(token => token.replace(/[+\-<>~*"()@]/g, ''))
    .filter(token => token.length >= minTokenLength)
    .slice(0, maxTokens);

  if (!tokens.length) return null;

  return tokens.map(token => `+${token}*`).join(' ');
}

export async function searchMessages(
  userId: number,
  query: string,
  limit: number
): Promise<MessageSearchResult[]> {
  const booleanQuery = buildBooleanQuery(query);

  if (!booleanQuery) return [];

  return messageSearchRepository.search(userId, booleanQuery, limit);
}
