import type { Transaction } from 'sequelize';
import { sequelize } from '../db/mysql';
import { ConversationSummary } from '../models/sql';

export interface ConversationSummaryAdvance {
  conversationId: number;
  messageId: number;
  senderId: number;
  createdAt: Date;
  body: string;
}

function toDateTimeString(date: Date): string {
  return date.toISOString().slice(0, -1).replace('T', ' ');
}

export interface ConversationSummaryRepository {
  insertInitial(conversationId: number, transaction: Transaction): Promise<void>;
  advance(input: ConversationSummaryAdvance, transaction: Transaction): Promise<void>;
}

class SequelizeConversationSummaryRepository implements ConversationSummaryRepository {
  async insertInitial(conversationId: number, transaction: Transaction): Promise<void> {
    await ConversationSummary.create({ conversationId }, { transaction });
  }

  async advance(input: ConversationSummaryAdvance, transaction: Transaction): Promise<void> {
    await sequelize.query(
      `INSERT INTO conversation_summaries
        (conversation_id, last_message_id, last_message_at, last_sender_id, last_message_preview)
      VALUES (:conversationId, :messageId, :createdAt, :senderId, LEFT(:body, 300)) AS incoming
      ON DUPLICATE KEY UPDATE
        last_message_at = IF(incoming.last_message_id > COALESCE(conversation_summaries.last_message_id, 0),
          incoming.last_message_at, conversation_summaries.last_message_at),
        last_sender_id = IF(incoming.last_message_id > COALESCE(conversation_summaries.last_message_id, 0),
          incoming.last_sender_id, conversation_summaries.last_sender_id),
        last_message_preview = IF(incoming.last_message_id > COALESCE(conversation_summaries.last_message_id, 0),
          incoming.last_message_preview, conversation_summaries.last_message_preview),
        last_message_id = IF(incoming.last_message_id > COALESCE(conversation_summaries.last_message_id, 0),
          incoming.last_message_id, conversation_summaries.last_message_id)`,
      {
        replacements: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          senderId: input.senderId,
          createdAt: toDateTimeString(input.createdAt),
          body: input.body
        },
        transaction
      }
    );
  }
}

export const conversationSummaryRepository: ConversationSummaryRepository =
  new SequelizeConversationSummaryRepository();
