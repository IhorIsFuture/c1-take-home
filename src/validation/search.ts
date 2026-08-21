import { z } from 'zod';

export const searchMessagesRequestSchema = z.object({
  query: z.object({
    q: z.string().trim().max(200, 'Must contain at most 200 characters').optional().default('')
  })
});

export type SearchMessagesRequest = z.output<typeof searchMessagesRequestSchema>;
