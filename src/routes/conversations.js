import express from 'express';
import { asyncHandler } from '../http/async-handler';
import { createConversation, listConversations } from '../services/conversations';

export const conversationsRouter = express.Router();

conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    res.json(await listConversations(userId));
  })
);

conversationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, participantIds } = req.body || {};
    if (!title || !Array.isArray(participantIds) || !participantIds.length) {
      return res.status(400).json({ error: 'title and a non-empty participantIds[] are required' });
    }

    res.status(201).json(await createConversation(title, participantIds.map(Number)));
  })
);
