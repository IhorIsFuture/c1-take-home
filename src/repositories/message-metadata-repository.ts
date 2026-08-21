import { Message } from '../models/sql';

export interface NewMessageMetadata {
  conversationId: number;
  senderId: number;
  clientId: string | null;
  createdAt: Date;
}

export interface MessageMetadata {
  id: number;
  conversationId: number;
  senderId: number;
  createdAt: Date;
}

export interface MessageMetadataRepository {
  create(input: NewMessageMetadata): Promise<MessageMetadata>;
  listByConversationId(conversationId: number): Promise<MessageMetadata[]>;
}

class SequelizeMessageMetadataRepository implements MessageMetadataRepository {
  async create(input: NewMessageMetadata): Promise<MessageMetadata> {
    const message = await Message.create(input);

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      createdAt: message.createdAt
    };
  }

  async listByConversationId(conversationId: number): Promise<MessageMetadata[]> {
    return Message.findAll({
      attributes: ['id', 'conversationId', 'senderId', 'createdAt'],
      where: { conversationId },
      order: [['id', 'ASC']],
      raw: true
    });
  }
}

export const messageMetadataRepository: MessageMetadataRepository =
  new SequelizeMessageMetadataRepository();
