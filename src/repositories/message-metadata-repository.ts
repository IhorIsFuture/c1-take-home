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

export interface MessageMetadataWriteResult {
  metadata: MessageMetadata;
  created: boolean;
}

export interface MessageMetadataRepository {
  createOrFind(input: NewMessageMetadata): Promise<MessageMetadataWriteResult>;
  listByConversationId(conversationId: number): Promise<MessageMetadata[]>;
}

function toMessageMetadata(message: Message): MessageMetadata {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    createdAt: message.createdAt
  };
}

class SequelizeMessageMetadataRepository implements MessageMetadataRepository {
  async createOrFind(input: NewMessageMetadata): Promise<MessageMetadataWriteResult> {
    if (!input.clientId) {
      const message = await Message.create(input);
      return { metadata: toMessageMetadata(message), created: true };
    }

    const [message, created] = await Message.findOrCreate({
      where: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        clientId: input.clientId
      },
      defaults: input
    });

    return { metadata: toMessageMetadata(message), created };
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
