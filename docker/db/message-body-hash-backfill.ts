import { col, Op, type Transaction, where } from 'sequelize';
import { Message } from '../../src/models/sql';
import {
  messageBodyRepository,
  type MessageBodyRepository
} from '../../src/repositories/message-body-repository';
import { hashMessageBody } from '../../src/services/message-body-hash';

const defaultBatchSize = 500;
const missingBodyHash = where(col('body_hash'), Op.is, null);

type StoredMessageBody = Awaited<ReturnType<MessageBodyRepository['findByIds']>>[number];

export interface MessageBodyHashBackfillResult {
  scanned: number;
  updated: number;
}

export interface MessageBodyHashVerificationResult {
  verified: number;
}

function requireMatchingBody(
  message: Message,
  bodyById: ReadonlyMap<number, StoredMessageBody>
): StoredMessageBody {
  const body = bodyById.get(message.id);

  if (!body) {
    throw new Error(`Mongo body for message ${message.id} was not found`);
  }

  const matchesMetadata =
    body.conversationId === message.conversationId &&
    body.senderId === message.senderId &&
    body.createdAt.getTime() === message.createdAt.getTime();

  if (!matchesMetadata) {
    throw new Error(`Mongo body for message ${message.id} does not match MySQL metadata`);
  }

  return body;
}

async function loadBodyById(messages: readonly Message[]): Promise<Map<number, StoredMessageBody>> {
  const bodies = await messageBodyRepository.findByIds(messages.map(message => message.id));
  return new Map(bodies.map(body => [body._id, body]));
}

async function updateBatch(messages: readonly Message[]): Promise<number> {
  const bodyById = await loadBodyById(messages);
  const updates = messages.map(message => ({
    id: message.id,
    bodyHash: hashMessageBody(requireMatchingBody(message, bodyById).body)
  }));

  return Message.sequelize!.transaction(async transaction => {
    let updated = 0;

    for (const update of updates) {
      const [updatedRows] = await Message.update(
        { bodyHash: update.bodyHash },
        {
          where: { id: update.id, [Op.and]: missingBodyHash },
          transaction
        }
      );

      if (updatedRows === 1) {
        updated += 1;
        continue;
      }

      await requireStoredHash(update.id, update.bodyHash, transaction);
    }

    return updated;
  });
}

async function requireStoredHash(
  messageId: number,
  expectedBodyHash: string,
  transaction: Transaction
): Promise<void> {
  const message = await Message.findByPk(messageId, {
    attributes: ['bodyHash'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (message?.bodyHash !== expectedBodyHash) {
    throw new Error(`Concurrent body hash conflict for message ${messageId}`);
  }
}

export async function backfillMessageBodyHashes(
  batchSize = defaultBatchSize
): Promise<MessageBodyHashBackfillResult> {
  let lastId = 0;
  let scanned = 0;
  let updated = 0;

  while (true) {
    const messages = await Message.findAll({
      attributes: ['id', 'conversationId', 'senderId', 'bodyHash', 'createdAt'],
      where: {
        id: { [Op.gt]: lastId },
        [Op.and]: missingBodyHash
      },
      order: [['id', 'ASC']],
      limit: batchSize
    });

    if (!messages.length) break;

    lastId = messages[messages.length - 1].id;
    scanned += messages.length;
    updated += await updateBatch(messages);
  }

  return { scanned, updated };
}

export async function verifyMessageBodyHashes(
  batchSize = defaultBatchSize
): Promise<MessageBodyHashVerificationResult> {
  let lastId = 0;
  let verified = 0;

  while (true) {
    const messages = await Message.findAll({
      attributes: ['id', 'conversationId', 'senderId', 'bodyHash', 'createdAt'],
      where: { id: { [Op.gt]: lastId } },
      order: [['id', 'ASC']],
      limit: batchSize
    });

    if (!messages.length) break;

    const bodyById = await loadBodyById(messages);

    for (const message of messages) {
      const expectedBodyHash = hashMessageBody(requireMatchingBody(message, bodyById).body);

      if (message.bodyHash !== expectedBodyHash) {
        throw new Error(`Body hash verification failed for message ${message.id}`);
      }
    }

    lastId = messages[messages.length - 1].id;
    verified += messages.length;
  }

  return { verified };
}
