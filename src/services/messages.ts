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

  const metadata = await messageMetadataRepository.create({
    conversationId,
    senderId,
    clientId,
    createdAt
  });

  await messageBodyRepository.create({
    _id: metadata.id,
    conversationId,
    senderId,
    body,
    signature,
    createdAt
  });

  const message = { id: metadata.id, conversationId, senderId, body, createdAt };
  broadcast(conversationId, { type: 'message', ...message });

  return message;
}

export async function listMessages(conversationId: number) {
  const messages = await messageMetadataRepository.listByConversationId(conversationId);
  const bodies = await messageBodyRepository.findByIds(messages.map(message => message.id));
  const bodyById = new Map(bodies.map(body => [body._id, body.body]));

  return messages.map(message => ({
    ...message,
    body: bodyById.get(message.id) ?? ''
  }));
}
