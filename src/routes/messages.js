import express from 'express';
import { createMessage, listMessages } from '../services/messages';

export const messagesRouter = express.Router();

messagesRouter.post('/', async (req, res) => {
  const { conversationId, senderId, body, clientId } = req.body || {};

  if (!conversationId || !senderId || !body) {
    return res.status(400).json({ error: 'conversationId, senderId and body are required' });
  }

  const msg = await createMessage({
    conversationId: Number(conversationId),
    senderId: Number(senderId),
    body: String(body),
    clientId: clientId ?? null
  });

  res.status(201).json(msg);
});

messagesRouter.get('/', async (req, res) => {
  const conversationId = Number(req.query.conversationId);

  if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

  res.json(await listMessages(conversationId));
});
