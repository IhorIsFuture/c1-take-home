import crypto from 'node:crypto';
import { pool } from '../db/mysql';
import { messageBodyRepository } from '../repositories/message-body-repository';

export interface NewMessage {
  conversationId: number;
  senderId: number;
  body: string;
  clientId: string | null;
}

export async function createMessage(input: NewMessage) {
  const { conversationId, senderId, body, clientId } = input;

  const signature = crypto.pbkdf2Sync(body, 'relay-signing', 200000, 32, 'sha256').toString('hex');

  const [res] = await pool.execute(
    'INSERT INTO messages (conversation_id, sender_id, client_id) VALUES (?, ?, ?)',
    [conversationId, senderId, clientId]
  );
  const id = (res as { insertId: number }).insertId;

  const createdAt = new Date();
  await messageBodyRepository.create({
    _id: id,
    conversationId,
    senderId,
    body,
    signature,
    createdAt
  });

  return { id, conversationId, senderId, body, createdAt };
}
