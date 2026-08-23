import { z } from 'zod';

export const authenticateFrameSchema = z
  .object({
    type: z.literal('authenticate'),
    accessToken: z.string().min(1).max(8192)
  })
  .strict();
