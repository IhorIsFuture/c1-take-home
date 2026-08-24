import {
  messageSearchRepository,
  type MessageSearchResult
} from '../repositories/message-search-repository';

const minTokenLength = 3;
const maxTokens = 10;
const maxShortTokens = 5;

export interface SearchPlan {
  booleanQuery: string;
  shortTokens: string[];
}

export function buildSearchPlan(query: string): SearchPlan | null {
  const tokens = query
    .split(/\s+/)
    .map(token => token.replace(/[+\-<>~*"()@]/g, ''))
    .filter(Boolean);
  const fulltextTokens = tokens.filter(token => token.length >= minTokenLength).slice(0, maxTokens);

  if (!fulltextTokens.length) return null;

  return {
    booleanQuery: fulltextTokens.map(token => `+${token}*`).join(' '),
    shortTokens: tokens.filter(token => token.length < minTokenLength).slice(0, maxShortTokens)
  };
}

export async function searchMessages(
  userId: number,
  query: string,
  limit: number
): Promise<MessageSearchResult[]> {
  const plan = buildSearchPlan(query);

  if (!plan) return [];

  return messageSearchRepository.search(userId, plan, limit);
}
