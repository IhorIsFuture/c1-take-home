import crypto from 'node:crypto';
import { HttpError } from '../errors/http-error';
import { conversationRepository } from '../repositories/conversation-repository';
import { messageBodyRepository } from '../repositories/message-body-repository';
import { messageMetadataRepository } from '../repositories/message-metadata-repository';
import { broadcast } from '../ws/hub';

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

export async function createMessage(userId: number, input: NewMessage) {
  const { conversationId, body, clientId } = input;
  await requireConversationAccess(conversationId, userId);

  const signature = crypto.pbkdf2Sync(body, 'relay-signing', 200000, 32, 'sha256').toString('hex');
  const createdAt = new Date();

  const { metadata, created } = await messageMetadataRepository.createOrFind({
    conversationId,
    senderId: userId,
    clientId,
    createdAt
  });

  const storedBody = await messageBodyRepository.put({
    _id: metadata.id,
    conversationId: metadata.conversationId,
    senderId: metadata.senderId,
    body,
    signature,
    createdAt: metadata.createdAt
  });

  const message = {
    id: metadata.id,
    conversationId: metadata.conversationId,
    senderId: metadata.senderId,
    senderName: metadata.senderName,
    body: storedBody.body,
    createdAt: metadata.createdAt
  };
  broadcast(metadata.conversationId, { type: 'message', ...message });

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
