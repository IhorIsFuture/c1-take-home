import { MessageBodyModel, type MessageBody } from './message-body-model';

export type LegacyMessageBodyContent = Pick<
  MessageBody,
  '_id' | 'conversationId' | 'senderId' | 'body' | 'createdAt'
>;

export const legacyMessageBodyRepository = {
  async findByIds(ids: readonly number[]): Promise<LegacyMessageBodyContent[]> {
    if (!ids.length) return [];

    return MessageBodyModel.find({ _id: { $in: ids } })
      .select({ _id: 1, conversationId: 1, senderId: 1, body: 1, createdAt: 1 })
      .lean<LegacyMessageBodyContent[]>()
      .exec();
  }
};
