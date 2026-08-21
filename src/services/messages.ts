import crypto from 'node:crypto';
import { messageBodyRepository } from '../repositories/message-body-repository';
import { messageMetadataRepository } from '../repositories/message-metadata-repository';
import { broadcast } from '../ws/hub';

export interface NewMessage {
  conversationId: number;
  senderId: number;
  body: string;
  clientId: string | null;
}

export async function createMessage(input: NewMessage) {
  const { conversationId, senderId, body, clientId } = input;

  const signature = crypto.pbkdf2Sync(body, 'relay-signing', 200000, 32, 'sha256').toString('hex');
  const createdAt = new Date();

  const { metadata, created } = await messageMetadataRepository.createOrFind({
    conversationId,
    senderId,
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
    body: storedBody.body,
    createdAt: metadata.createdAt
  };
  broadcast(metadata.conversationId, { type: 'message', ...message });

  return { message, created };
}

export async function listMessages(conversationId: number) {
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
