import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../db/mysql';

export interface ParticipantReadState {
  lastReadMessageId: number | null;
  unreadCount: number;
}

export interface AdvanceCursorInput {
  conversationId: number;
  userId: number;
  throughMessageId: number;
}

export interface ConversationReadStateRepository {
  incrementUnreadForOthers(
    conversationId: number,
    senderId: number,
    transaction: Transaction
  ): Promise<void>;
  advanceCursor(input: AdvanceCursorInput, transaction?: Transaction): Promise<void>;
  getReadState(conversationId: number, userId: number): Promise<ParticipantReadState | null>;
}

class SequelizeConversationReadStateRepository implements ConversationReadStateRepository {
  async incrementUnreadForOthers(
    conversationId: number,
    senderId: number,
    transaction: Transaction
  ): Promise<void> {
    await sequelize.query(
      `UPDATE conversation_participants
      SET unread_count = unread_count + 1
      WHERE conversation_id = :conversationId AND user_id <> :senderId`,
      { replacements: { conversationId, senderId }, transaction }
    );
  }

  async advanceCursor(input: AdvanceCursorInput, transaction?: Transaction): Promise<void> {
    await sequelize.query(
      `UPDATE conversation_participants
      SET unread_count = (
        SELECT COUNT(*) FROM messages m
        WHERE m.conversation_id = :conversationId
          AND m.id > GREATEST(COALESCE(last_read_message_id, 0), :throughMessageId)
          AND m.sender_id <> :userId
      ),
      last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), :throughMessageId)
      WHERE conversation_id = :conversationId AND user_id = :userId`,
      { replacements: { ...input }, transaction }
    );
  }

  async getReadState(conversationId: number, userId: number): Promise<ParticipantReadState | null> {
    const rows = await sequelize.query<ParticipantReadState>(
      `SELECT last_read_message_id AS lastReadMessageId, unread_count AS unreadCount
      FROM conversation_participants
      WHERE conversation_id = :conversationId AND user_id = :userId`,
      { replacements: { conversationId, userId }, type: QueryTypes.SELECT }
    );

    return rows[0] ?? null;
  }
}

export const conversationReadStateRepository: ConversationReadStateRepository =
  new SequelizeConversationReadStateRepository();
