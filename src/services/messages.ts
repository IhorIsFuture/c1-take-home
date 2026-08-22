import crypto from 'node:crypto';
import { HttpError } from '../errors/http-error';
import { conversationRepository } from '../repositories/conversation-repository';
import { messageBodyRepository } from '../repositories/message-body-repository';
import { messageMetadataRepository } from '../repositories/message-metadata-repository';
import type { RealtimePublisher } from '../realtime/index';
import { hashMessageBody } from './message-body-hash';

export interface NewMessage {
  conversationId: number;
  body: string;
  clientId: string;
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

export async function createMessage(
  userId: number,
  input: NewMessage,
  realtimePublisher: RealtimePublisher
) {
  const { conversationId, body, clientId } = input;
  await requireConversationAccess(conversationId, userId);

  const bodyHash = hashMessageBody(body);
  const createdAt = new Date();

  const {
    metadata,
    created,
    bodyHash: storedBodyHash
  } = await messageMetadataRepository.createOrFind({
    conversationId,
    senderId: userId,
    clientId,
    bodyHash,
    createdAt
  });

  if (storedBodyHash && storedBodyHash !== bodyHash) {
    throw idempotencyConflict();
  }

  if (!storedBodyHash) {
    const [legacyBody] = await messageBodyRepository.findByIds([metadata.id]);
    const belongsToMetadata =
      legacyBody?.conversationId === metadata.conversationId &&
      legacyBody.senderId === metadata.senderId &&
      legacyBody.createdAt.getTime() === metadata.createdAt.getTime();

    if (belongsToMetadata && legacyBody.body !== body) {
      throw idempotencyConflict();
    }

    const boundBodyHash = await messageMetadataRepository.bindBodyHash(metadata.id, bodyHash);

    if (boundBodyHash !== bodyHash) {
      throw idempotencyConflict();
    }
  }

  const signature = crypto.pbkdf2Sync(body, 'relay-signing', 200000, 32, 'sha256').toString('hex');
  const { body: storedBody, materialized } = await messageBodyRepository.put({
    _id: metadata.id,
    conversationId: metadata.conversationId,
    senderId: metadata.senderId,
    body,
    signature,
    createdAt: metadata.createdAt
  });

  if (storedBody.body !== body) {
    throw idempotencyConflict();
  }

  const message = {
    id: metadata.id,
    conversationId: metadata.conversationId,
    senderId: metadata.senderId,
    senderName: metadata.senderName,
    body: storedBody.body,
    createdAt: metadata.createdAt
  };

  if (materialized) {
    await realtimePublisher.publish({ type: 'message.created', message });
  }

  return { message, created };
}

export async function listMessages(userId: number, conversationId: number) {
  await requireConversationAccess(conversationId, userId);
  const messages = await messageMetadataRepository.listByConversationId(conversationId);
  const bodies = await messageBodyRepository.findByIds(messages.map(message => message.id));
  const bodyById = new Map(bodies.map(body => [body._id, body]));

  return messages.map(message => {
    const body = bodyById.get(message.id);
    const belongsToMessage =
      body?.conversationId === message.conversationId &&
      body.senderId === message.senderId &&
      body.createdAt.getTime() === message.createdAt.getTime();

    return { ...message, body: belongsToMessage ? body.body : '' };
  });
}
