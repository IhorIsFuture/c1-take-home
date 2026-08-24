import { Transaction, UniqueConstraintError } from 'sequelize';
import { isDeadlockError } from '../db/errors';
import { sequelize } from '../db/mysql';
import { HttpError } from '../errors/http-error';
import { conversationReadStateRepository } from '../repositories/conversation-read-state-repository';
import { conversationRepository } from '../repositories/conversation-repository';
import { conversationSummaryRepository } from '../repositories/conversation-summary-repository';
import { messageBodyRepository } from '../repositories/message-body-repository';
import {
  messageMetadataRepository,
  type MessageRecord
} from '../repositories/message-metadata-repository';
import { outboxRepository } from '../repositories/outbox-repository';
import { userRepository } from '../repositories/user-repository';
import type { RealtimePublisher } from '../realtime/index';
import { hashMessageBody } from './message-body-hash';

export interface NewMessage {
  conversationId: number;
  body: string;
  clientId: string;
}

export interface MessageDto {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: Date;
}

export function messageCreatedEventId(messageId: number): string {
  return `message.created:${messageId}`;
}

async function requireConversationAccess(conversationId: number, userId: number): Promise<void> {
  if (!(await conversationRepository.hasParticipant(conversationId, userId))) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
}

function idempotencyConflict(): HttpError {
  return new HttpError(
    409,
    'MESSAGE_IDEMPOTENCY_CONFLICT',
    'Client ID has already been used with a different message body'
  );
}

function reportMissingBodies(records: readonly MessageRecord[]): void {
  const missingIds = records.filter(record => record.body === null).map(record => record.id);

  if (missingIds.length) {
    console.error(`Message bodies are missing in MySQL for ids: ${missingIds.join(', ')}`);
  }
}

function toMessageDto(record: MessageRecord): MessageDto {
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    senderName: record.senderName,
    body: record.body ?? '',
    createdAt: record.createdAt
  };
}

export async function createMessage(
  userId: number,
  input: NewMessage,
  realtimePublisher: RealtimePublisher
): Promise<{ message: MessageDto; created: boolean }> {
  const { conversationId, body, clientId } = input;
  const participantIds = await conversationRepository.listParticipantIds(conversationId);

  if (!participantIds.includes(userId)) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  const sender = await userRepository.findPublicById(userId);

  if (!sender) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  const bodyHash = hashMessageBody(body);
  let deadlockRetried = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await messageMetadataRepository.findByClientKey({
      conversationId,
      senderId: userId,
      clientId
    });

    if (existing) {
      if (existing.bodyHash !== bodyHash) throw idempotencyConflict();
      reportMissingBodies([existing]);
      return { message: toMessageDto(existing), created: false };
    }

    let created: { id: number; createdAt: Date };

    try {
      created = await sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
        async transaction => {
          const createdAt = new Date();
          const id = await messageMetadataRepository.insertMetadata(
            { conversationId, senderId: userId, clientId, bodyHash, createdAt },
            transaction
          );

          await messageBodyRepository.insert({ messageId: id, body }, transaction);
          await conversationSummaryRepository.advance(
            { conversationId, messageId: id, senderId: userId, createdAt, body },
            transaction
          );
          await conversationReadStateRepository.incrementUnreadForOthers(
            conversationId,
            userId,
            transaction
          );
          await conversationReadStateRepository.advanceCursor(
            { conversationId, userId, throughMessageId: id },
            transaction
          );
          await outboxRepository.insertPending(
            {
              eventId: messageCreatedEventId(id),
              eventType: 'message.created',
              messageId: id,
              conversationId
            },
            transaction
          );

          return { id, createdAt };
        }
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) continue;

      if (isDeadlockError(error) && !deadlockRetried) {
        deadlockRetried = true;
        attempt -= 1;
        continue;
      }

      throw error;
    }

    const message: MessageDto = {
      id: created.id,
      conversationId,
      senderId: userId,
      senderName: sender.name,
      body,
      createdAt: created.createdAt
    };

    try {
      await realtimePublisher.publish({ type: 'message.created', message }, participantIds);
      await outboxRepository.markPublishedByEventId(messageCreatedEventId(created.id));
    } catch (error) {
      console.error(`Failed to publish message.created for message ${created.id}`, error);
    }

    return { message, created: true };
  }

  throw new Error(`Could not create message for client id ${clientId}`);
}

export async function listConversationMessages(
  userId: number,
  conversationId: number,
  beforeId: number | undefined,
  limit: number
): Promise<MessageDto[]> {
  await requireConversationAccess(conversationId, userId);

  const records = await messageMetadataRepository.findPage(conversationId, beforeId, limit);

  reportMissingBodies(records);

  return records.map(toMessageDto).reverse();
}
