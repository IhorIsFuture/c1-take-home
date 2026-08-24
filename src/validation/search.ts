import { z } from 'zod';

export const searchMessagesRequestSchema = z.object({
  query: z.object({
    q: z.string().trim().max(200, 'Must contain at most 200 characters').optional().default(''),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20)
  })
});

export type SearchMessagesRequest = z.output<typeof searchMessagesRequestSchema>;
