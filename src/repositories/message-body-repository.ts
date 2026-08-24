import { Op, type Transaction } from 'sequelize';
import { MessageBody } from '../models/sql';

export interface MessageBodyRow {
  messageId: number;
  body: string;
}

export interface MessageBodyRepository {
  insert(row: MessageBodyRow, transaction: Transaction): Promise<void>;
  findByMessageIds(ids: readonly number[]): Promise<MessageBodyRow[]>;
}

class SequelizeMessageBodyRepository implements MessageBodyRepository {
  async insert(row: MessageBodyRow, transaction: Transaction): Promise<void> {
    await MessageBody.create(row, { transaction });
  }

  async findByMessageIds(ids: readonly number[]): Promise<MessageBodyRow[]> {
    if (!ids.length) return [];

    const rows = await MessageBody.findAll({
      attributes: ['messageId', 'body'],
      where: { messageId: { [Op.in]: [...ids] } },
      raw: true
    });

    return rows.map(row => ({ messageId: row.messageId, body: row.body }));
  }
}

export const messageBodyRepository: MessageBodyRepository = new SequelizeMessageBodyRepository();
