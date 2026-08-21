import { Op } from 'sequelize';
import { sequelize } from '../db/mysql';
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
}

export interface CreatedConversation extends NewConversation {
  id: number;
}

export interface ConversationRepository {
  listByUserId(userId: number): Promise<ConversationDto[]>;
  create(input: NewConversation): Promise<CreatedConversation>;
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

  async create(input: NewConversation): Promise<CreatedConversation> {
    return sequelize.transaction(async transaction => {
      const conversation = await Conversation.create({ title: input.title }, { transaction });

      await ConversationParticipant.bulkCreate(
        input.participantIds.map(userId => ({
          conversationId: conversation.id,
          userId
        })),
        { transaction }
      );

      return {
        id: conversation.id,
        title: conversation.title,
        participantIds: input.participantIds
      };
    });
  }
}

export const conversationRepository: ConversationRepository = new SequelizeConversationRepository();
