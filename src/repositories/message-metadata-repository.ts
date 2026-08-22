import type { IncludeOptions } from 'sequelize';
import { Message, User } from '../models/sql';

export interface NewMessageMetadata {
  conversationId: number;
  senderId: number;
  clientId: string;
  bodyHash: string;
  createdAt: Date;
}

export interface MessageMetadata {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  createdAt: Date;
}

export interface MessageMetadataWriteResult {
  metadata: MessageMetadata;
  created: boolean;
  bodyHash: string;
}

export interface MessageMetadataRepository {
  createOrFind(input: NewMessageMetadata): Promise<MessageMetadataWriteResult>;
  listByConversationId(conversationId: number): Promise<MessageMetadata[]>;
}

function toMessageMetadata(message: Message): MessageMetadata {
  if (!message.sender) {
    throw new Error(`Sender for message ${message.id} was not loaded`);
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender.name,
    createdAt: message.createdAt
  };
}

const senderInclude: IncludeOptions = {
  model: User,
  as: 'sender',
  attributes: ['name'],
  required: true
};

class SequelizeMessageMetadataRepository implements MessageMetadataRepository {
  async createOrFind(input: NewMessageMetadata): Promise<MessageMetadataWriteResult> {
    const [message, created] = await Message.findOrCreate({
      where: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        clientId: input.clientId
      },
      defaults: input
    });

    const messageWithSender = await Message.findByPk(message.id, {
      attributes: ['id', 'conversationId', 'senderId', 'bodyHash', 'createdAt'],
      include: [senderInclude]
    });

    if (!messageWithSender) {
      throw new Error(`Message ${message.id} was not found after creation`);
    }

    return {
      metadata: toMessageMetadata(messageWithSender),
      created,
      bodyHash: messageWithSender.bodyHash
    };
  }

  async listByConversationId(conversationId: number): Promise<MessageMetadata[]> {
    const messages = await Message.findAll({
      attributes: ['id', 'conversationId', 'senderId', 'createdAt'],
      include: [senderInclude],
      where: { conversationId },
      order: [['id', 'ASC']]
    });

    return messages.map(toMessageMetadata);
  }
}

export const messageMetadataRepository: MessageMetadataRepository =
  new SequelizeMessageMetadataRepository();
