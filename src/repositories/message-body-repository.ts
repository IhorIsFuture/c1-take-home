import { MessageBodyModel, type MessageBody } from '../models/message-body';

type MessageBodyContent = Pick<
  MessageBody,
  '_id' | 'conversationId' | 'senderId' | 'body' | 'createdAt'
>;

export interface MessageBodyWriteResult {
  body: MessageBodyContent;
  materialized: boolean;
}

export interface MessageBodyRepository {
  put(message: MessageBody): Promise<MessageBodyWriteResult>;
  findByIds(ids: readonly number[]): Promise<MessageBodyContent[]>;
  ensureSeeded(messages: readonly MessageBody[]): Promise<void>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function belongsToMetadata(current: MessageBodyContent, message: MessageBody): boolean {
  return (
    current.conversationId === message.conversationId &&
    current.senderId === message.senderId &&
    current.createdAt.getTime() === message.createdAt.getTime()
  );
}

class MongooseMessageBodyRepository implements MessageBodyRepository {
  async put(message: MessageBody): Promise<MessageBodyWriteResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await MessageBodyModel.findById(message._id)
        .lean<MessageBodyContent>()
        .exec();

      if (!current) {
        try {
          await MessageBodyModel.create(message);
          return { body: message, materialized: true };
        } catch (error) {
          if (isDuplicateKeyError(error)) continue;
          throw error;
        }
      }

      if (belongsToMetadata(current, message)) {
        return { body: current, materialized: false };
      }

      const result = await MessageBodyModel.replaceOne(
        {
          _id: current._id,
          conversationId: current.conversationId,
          senderId: current.senderId,
          createdAt: current.createdAt
        },
        message
      ).exec();

      if (result.modifiedCount === 1) {
        return { body: message, materialized: true };
      }
    }

    throw new Error(`could not persist body for message ${message._id}`);
  }

  async findByIds(ids: readonly number[]): Promise<MessageBodyContent[]> {
    if (!ids.length) return [];

    return MessageBodyModel.find({ _id: { $in: ids } })
      .select({ _id: 1, conversationId: 1, senderId: 1, body: 1, createdAt: 1 })
      .lean<MessageBodyContent[]>()
      .exec();
  }

  async ensureSeeded(messages: readonly MessageBody[]): Promise<void> {
    if (!messages.length) return;

    await MessageBodyModel.bulkWrite(
      messages.map(message => {
        const { _id, ...data } = message;

        return {
          updateOne: {
            filter: { _id },
            update: { $set: data },
            upsert: true
          }
        };
      })
    );
  }
}

export const messageBodyRepository: MessageBodyRepository = new MongooseMessageBodyRepository();
