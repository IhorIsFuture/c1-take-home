import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/mysql';
import type { SearchPlan } from '../services/search';

export interface MessageSearchResult {
  id: number;
  conversationId: number;
  conversationTitle: string;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: Date;
}

export interface MessageSearchRepository {
  search(userId: number, plan: SearchPlan, limit: number): Promise<MessageSearchResult[]>;
}

function escapeRegexToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class SequelizeMessageSearchRepository implements MessageSearchRepository {
  async search(userId: number, plan: SearchPlan, limit: number): Promise<MessageSearchResult[]> {
    const replacements: Record<string, unknown> = {
      userId,
      booleanQuery: plan.booleanQuery,
      limit
    };
    const shortTokenConditions = plan.shortTokens
      .map((token, index) => {
        replacements[`shortToken${index}`] = `\\b${escapeRegexToken(token)}\\b`;
        return `AND b.body REGEXP :shortToken${index}`;
      })
      .join('\n      ');

    return sequelize.query<MessageSearchResult>(
      `SELECT m.id, m.conversation_id AS conversationId, c.title AS conversationTitle,
        m.sender_id AS senderId, u.name AS senderName, b.body, m.created_at AS createdAt
      FROM message_bodies b
      JOIN messages m ON m.id = b.message_id
      JOIN conversation_participants p
        ON p.conversation_id = m.conversation_id AND p.user_id = :userId
      JOIN conversations c ON c.id = m.conversation_id
      JOIN users u ON u.id = m.sender_id
      WHERE MATCH(b.body) AGAINST(:booleanQuery IN BOOLEAN MODE)
      ${shortTokenConditions}
      ORDER BY MATCH(b.body) AGAINST(:booleanQuery IN BOOLEAN MODE) DESC, m.id DESC
      LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
  }
}

export const messageSearchRepository: MessageSearchRepository =
  new SequelizeMessageSearchRepository();
