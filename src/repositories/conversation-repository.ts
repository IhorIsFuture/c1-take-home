import { Op } from 'sequelize';
import { sequelize } from '../db/mysql';
import { HttpError } from '../errors/http-error';
import { Conversation, ConversationParticipant, Message } from '../models/sql';

export interface LastMessageDto {
  id: number;
  senderId: number;
  createdAt: Date;
}

export interface ConversationDto {
  id: number;
  title: string;
  lastMessage: LastMessageDto | null;
  messageCount: number;
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
  hasParticipant(conversationId: number, userId: number): Promise<boolean>;
  hasAccessToAll(userId: number, conversationIds: readonly number[]): Promise<boolean>;
}

class SequelizeConversationRepository implements ConversationRepository {
  async listByUserId(userId: number): Promise<ConversationDto[]> {
    const conversations = await Conversation.findAll({
      attributes: ['id', 'title'],
      include: [
        {
          model: ConversationParticipant,
          attributes: [],
          where: { userId },
          required: true
        }
      ],
      order: [['id', 'ASC']],
      raw: true
    });

    if (!conversations.length) return [];

    const conversationIds = conversations.map(conversation => conversation.id);
    const messages = await Message.findAll({
      attributes: ['id', 'conversationId', 'senderId', 'createdAt'],
      where: { conversationId: { [Op.in]: conversationIds } },
      order: [
        ['conversationId', 'ASC'],
        ['id', 'DESC']
      ],
      raw: true
    });

    const summaryByConversationId = new Map<
      number,
      { lastMessage: LastMessageDto; messageCount: number }
    >();

    for (const message of messages) {
      const conversationId = message.conversationId;
      const current = summaryByConversationId.get(conversationId);

      if (current) {
        current.messageCount += 1;
        continue;
      }

      summaryByConversationId.set(conversationId, {
        lastMessage: {
          id: message.id,
          senderId: message.senderId,
          createdAt: message.createdAt
        },
        messageCount: 1
      });
    }

    return conversations.map(conversation => {
      const id = conversation.id;
      const summary = summaryByConversationId.get(id);

      return {
        id,
        title: conversation.title,
        lastMessage: summary?.lastMessage ?? null,
        messageCount: summary?.messageCount ?? 0
      };
    });
  }

  async createOrFind(input: NewConversation): Promise<ConversationWriteResult> {
    return sequelize.transaction(async transaction => {
      const [conversation, created] = await Conversation.findOrCreate({
        where: {
          createdByUserId: input.createdByUserId,
          clientId: input.clientId
        },
        defaults: {
          title: input.title,
          createdByUserId: input.createdByUserId,
          clientId: input.clientId
        },
        transaction
      });

      if (!created) {
        const currentParticipantIds = (
          await ConversationParticipant.findAll({
            attributes: ['userId'],
            where: { conversationId: conversation.id },
            order: [['userId', 'ASC']],
            raw: true,
            transaction
          })
        ).map(participant => participant.userId);
        const requestedParticipantIds = [...input.participantIds].sort(
          (left, right) => left - right
        );

        if (
          conversation.title !== input.title ||
          currentParticipantIds.length !== requestedParticipantIds.length ||
          currentParticipantIds.some((userId, index) => userId !== requestedParticipantIds[index])
        ) {
          throw new HttpError(
            409,
            'IDEMPOTENCY_KEY_REUSED',
            'The idempotency key was already used with different conversation data'
          );
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

      await ConversationParticipant.bulkCreate(
        input.participantIds.map(userId => ({
          conversationId: conversation.id,
          userId
        })),
        { transaction }
      );

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
  }

  async hasParticipant(conversationId: number, userId: number): Promise<boolean> {
    return Boolean(await ConversationParticipant.count({ where: { conversationId, userId } }));
  }

  async hasAccessToAll(userId: number, conversationIds: readonly number[]): Promise<boolean> {
    const uniqueConversationIds = [...new Set(conversationIds)];
    if (!uniqueConversationIds.length) return true;

    const accessibleCount = await ConversationParticipant.count({
      where: {
        userId,
        conversationId: { [Op.in]: uniqueConversationIds }
      }
    });

    return accessibleCount === uniqueConversationIds.length;
  }
}

export const conversationRepository: ConversationRepository = new SequelizeConversationRepository();
