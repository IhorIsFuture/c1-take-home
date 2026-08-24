import { Op, type IncludeOptions, type Transaction } from 'sequelize';
import { Message, MessageBody, User } from '../models/sql';

export interface MessageClientKey {
  conversationId: number;
  senderId: number;
  clientId: string;
}

export interface NewMessageMetadata extends MessageClientKey {
  bodyHash: string;
  createdAt: Date;
}

export interface MessageRecord {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  bodyHash: string;
  createdAt: Date;
  body: string | null;
}

export interface MessageMetadataRepository {
  findByClientKey(key: MessageClientKey): Promise<MessageRecord | null>;
  insertMetadata(input: NewMessageMetadata, transaction: Transaction): Promise<number>;
  findPage(
    conversationId: number,
    beforeId: number | undefined,
    limit: number
  ): Promise<MessageRecord[]>;
  findByIds(ids: readonly number[]): Promise<MessageRecord[]>;
  messageBelongsToConversation(messageId: number, conversationId: number): Promise<boolean>;
}

const senderInclude: IncludeOptions = {
  model: User,
  as: 'sender',
  attributes: ['name'],
  required: true
};

const bodyInclude: IncludeOptions = {
  model: MessageBody,
  as: 'bodyRow',
  attributes: ['body'],
  required: false
};

const recordAttributes = ['id', 'conversationId', 'senderId', 'bodyHash', 'createdAt'];

function toMessageRecord(message: Message): MessageRecord {
  if (!message.sender) {
    throw new Error(`Sender for message ${message.id} was not loaded`);
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender.name,
    bodyHash: message.bodyHash,
    createdAt: message.createdAt,
    body: message.bodyRow ? message.bodyRow.body : null
  };
}

class SequelizeMessageMetadataRepository implements MessageMetadataRepository {
  async findByClientKey(key: MessageClientKey): Promise<MessageRecord | null> {
    const message = await Message.findOne({
      attributes: recordAttributes,
      where: {
        conversationId: key.conversationId,
        senderId: key.senderId,
        clientId: key.clientId
      },
      include: [senderInclude, bodyInclude]
    });

    return message ? toMessageRecord(message) : null;
  }

  async insertMetadata(input: NewMessageMetadata, transaction: Transaction): Promise<number> {
    const message = await Message.create(input, { transaction });
    return message.id;
  }

  async findPage(
    conversationId: number,
    beforeId: number | undefined,
    limit: number
  ): Promise<MessageRecord[]> {
    const messages = await Message.findAll({
      attributes: recordAttributes,
      where: {
        conversationId,
        ...(beforeId === undefined ? {} : { id: { [Op.lt]: beforeId } })
      },
      include: [senderInclude, bodyInclude],
      order: [['id', 'DESC']],
      limit
    });

    return messages.map(toMessageRecord);
  }

  async findByIds(ids: readonly number[]): Promise<MessageRecord[]> {
    if (!ids.length) return [];

    const messages = await Message.findAll({
      attributes: recordAttributes,
      where: { id: { [Op.in]: [...ids] } },
      include: [senderInclude, bodyInclude]
    });

    return messages.map(toMessageRecord);
  }

  async messageBelongsToConversation(messageId: number, conversationId: number): Promise<boolean> {
    return !!(await Message.count({ where: { id: messageId, conversationId } }));
  }
}

export const messageMetadataRepository: MessageMetadataRepository =
  new SequelizeMessageMetadataRepository();
