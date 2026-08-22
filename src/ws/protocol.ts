import { z } from 'zod';

export const authenticateFrameSchema = z
  .object({
    type: z.literal('authenticate'),
    accessToken: z.string().min(1).max(8_192)
  })
  .strict();

export const subscribeFrameSchema = z
  .object({
    type: z.literal('subscribe'),
    conversationIds: z.array(z.number().int().positive().max(4_294_967_295)).max(1_000)
  })
  .strict();
