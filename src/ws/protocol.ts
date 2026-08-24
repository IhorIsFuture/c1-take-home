import { z } from 'zod';

export const authenticateFrameSchema = z
  .object({
    type: z.literal('authenticate'),
    accessToken: z.string().min(1).max(8192)
  })
  .strict();

export const typingFrameSchema = z
  .object({
    type: z.literal('typing'),
    conversationId: z.number().int().positive().max(4294967295)
  })
  .strict();
