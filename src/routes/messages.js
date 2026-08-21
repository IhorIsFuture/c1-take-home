import express from 'express';
import { asyncHandler } from '../http/async-handler';
import { createMessage, listMessages } from '../services/messages';

export const messagesRouter = express.Router();

messagesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { conversationId, senderId, body, clientId } = req.body || {};

    if (!conversationId || !senderId || !body) {
      return res.status(400).json({ error: 'conversationId, senderId and body are required' });
    }

    const { message, created } = await createMessage({
      conversationId: Number(conversationId),
      senderId: Number(senderId),
      body: String(body),
      clientId: clientId ?? null
    });

    res.status(created ? 201 : 200).json(message);
  })
);

messagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const conversationId = Number(req.query.conversationId);

    if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });

    res.json(await listMessages(conversationId));
  })
);
