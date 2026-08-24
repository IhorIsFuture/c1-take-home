import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../db/mysql';
import { HttpError } from '../errors/http-error';
import { Conversation, ConversationParticipant, ConversationSummary } from '../models/sql';

export interface ConversationLastMessageDto {
  id: number;
  senderId: number;
  senderName: string;
  preview: string | null;
  createdAt: Date;
}

export interface ConversationDto {
  id: number;
  title: string;
  lastMessage: ConversationLastMessageDto | null;
  unreadCount: number;
}

export interface NewConversation {
  title: string;
  participantIds: number[];
  createdByUserId: number;
  clientId: string;
}

export interface CreatedConversation extends NewConversation {
  id: number;
}

export interface ConversationWriteResult {
  conversation: CreatedConversation;
  created: boolean;
}

export interface ConversationRepository {
  listByUserId(userId: number): Promise<ConversationDto[]>;
  createOrFind(input: NewConversation): Promise<ConversationWriteResult>;
  listParticipantIds(conversationId: number): Promise<number[]>;
  listParticipantIdsByConversationIds(
    conversationIds: readonly number[]
  ): Promise<Map<number, number[]>>;
  hasParticipant(conversationId: number, userId: number): Promise<boolean>;
}

interface ConversationListRow {
  id: number;
  title: string;
  unreadCount: number;
  lastMessageId: number | null;
  lastMessageAt: Date | null;
  lastSenderId: number | null;
  lastSenderName: string | null;
  lastMessagePreview: string | null;
}

function idempotencyConflict(): HttpError {
  return new HttpError(
    409,
    'IDEMPOTENCY_KEY_REUSED',
    'The idempotency key was already used with different conversation data'
  );
}

async function findExistingConversation(
  input: NewConversation
): Promise<ConversationWriteResult | null> {
  const conversation = await Conversation.findOne({
    where: {
      createdByUserId: input.createdByUserId,
      clientId: input.clientId
    }
  });

  if (!conversation) return null;

  const currentParticipantIds = (
    await ConversationParticipant.findAll({
      attributes: ['userId'],
      where: { conversationId: conversation.id },
      order: [['userId', 'ASC']],
      raw: true
    })
  ).map(participant => participant.userId);
  const requestedParticipantIds = [...input.participantIds].sort((left, right) => left - right);

  if (
    conversation.title !== input.title ||
    currentParticipantIds.length !== requestedParticipantIds.length ||
    currentParticipantIds.some((userId, index) => userId !== requestedParticipantIds[index])
  ) {
    throw idempotencyConflict();
  }

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      participantIds: currentParticipantIds,
      createdByUserId: conversation.createdByUserId,
      clientId: conversation.clientId
    },
    created: false
  };
}

class SequelizeConversationRepository implements ConversationRepository {
  async listByUserId(userId: number): Promise<ConversationDto[]> {
    const rows = await sequelize.query<ConversationListRow>(
      `SELECT c.id, c.title, p.unread_count AS unreadCount,
        s.last_message_id AS lastMessageId, s.last_message_at AS lastMessageAt,
        s.last_sender_id AS lastSenderId, u.name AS lastSenderName,
        s.last_message_preview AS lastMessagePreview
      FROM conversation_participants p
      JOIN conversations c ON c.id = p.conversation_id
      LEFT JOIN conversation_summaries s ON s.conversation_id = c.id
      LEFT JOIN users u ON u.id = s.last_sender_id
      WHERE p.user_id = :userId
      ORDER BY COALESCE(s.last_message_at, c.created_at) DESC, c.id DESC`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      unreadCount: row.unreadCount,
      lastMessage:
        row.lastMessageId === null ||
        row.lastMessageAt === null ||
        row.lastSenderId === null ||
        row.lastSenderName === null
          ? null
          : {
              id: row.lastMessageId,
              senderId: row.lastSenderId,
              senderName: row.lastSenderName,
              preview: row.lastMessagePreview,
              createdAt: row.lastMessageAt
            }
    }));
  }

  async createOrFind(input: NewConversation): Promise<ConversationWriteResult> {
    const existingConversation = await findExistingConversation(input);
    if (existingConversation) return existingConversation;

    try {
      return await sequelize.transaction(async transaction => {
        const conversation = await Conversation.create(
          {
            title: input.title,
            createdByUserId: input.createdByUserId,
            clientId: input.clientId
          },
          { transaction }
        );

        await ConversationParticipant.bulkCreate(
          input.participantIds.map(userId => ({
            conversationId: conversation.id,
            userId
          })),
          { transaction }
        );

        await ConversationSummary.create({ conversationId: conversation.id }, { transaction });

        return {
          conversation: {
            id: conversation.id,
            title: conversation.title,
            participantIds: input.participantIds,
            createdByUserId: conversation.createdByUserId,
            clientId: conversation.clientId
          },
          created: true
        };
      });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;

      const concurrentConversation = await findExistingConversation(input);
      if (concurrentConversation) return concurrentConversation;

      throw error;
    }
  }

  async hasParticipant(conversationId: number, userId: number): Promise<boolean> {
    return !!(await ConversationParticipant.count({ where: { conversationId, userId } }));
  }

  async listParticipantIds(conversationId: number): Promise<number[]> {
    const participants = await ConversationParticipant.findAll({
      attributes: ['userId'],
      where: { conversationId },
      order: [['userId', 'ASC']],
      raw: true
    });

    return participants.map(participant => participant.userId);
  }

  async listParticipantIdsByConversationIds(
    conversationIds: readonly number[]
  ): Promise<Map<number, number[]>> {
    const participantsByConversationId = new Map<number, number[]>();

    if (!conversationIds.length) return participantsByConversationId;

    const rows = await sequelize.query<{ conversationId: number; userId: number }>(
      `SELECT conversation_id AS conversationId, user_id AS userId
      FROM conversation_participants
      WHERE conversation_id IN (:conversationIds)
      ORDER BY conversation_id, user_id`,
      { replacements: { conversationIds: [...conversationIds] }, type: QueryTypes.SELECT }
    );

    for (const row of rows) {
      const participantIds = participantsByConversationId.get(row.conversationId) ?? [];
      participantIds.push(row.userId);
      participantsByConversationId.set(row.conversationId, participantIds);
    }

    return participantsByConversationId;
  }
}

export const conversationRepository: ConversationRepository = new SequelizeConversationRepository();
