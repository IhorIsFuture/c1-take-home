import { MessageBodyModel, type MessageBody } from '../models/message-body';

type MessageBodyContent = Pick<MessageBody, '_id' | 'body'>;

export interface MessageBodyRepository {
  create(message: MessageBody): Promise<void>;
  findByIds(ids: readonly number[]): Promise<MessageBodyContent[]>;
  ensureSeeded(messages: readonly MessageBody[]): Promise<void>;
}

class MongooseMessageBodyRepository implements MessageBodyRepository {
  async create(message: MessageBody): Promise<void> {
    await MessageBodyModel.create(message);
  }

  async findByIds(ids: readonly number[]): Promise<MessageBodyContent[]> {
    if (!ids.length) return [];

    return MessageBodyModel.find({ _id: { $in: ids } })
      .select({ _id: 1, body: 1 })
      .lean<MessageBodyContent[]>()
      .exec();
  }

  async ensureSeeded(messages: readonly MessageBody[]): Promise<void> {
    if (!messages.length) return;

    await MessageBodyModel.bulkWrite(
      messages.map(message => ({
        updateOne: {
          filter: { _id: message._id },
          update: { $setOnInsert: message },
          upsert: true
        }
      }))
    );
  }
}

export const messageBodyRepository: MessageBodyRepository = new MongooseMessageBodyRepository();
