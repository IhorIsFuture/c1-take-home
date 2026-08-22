import { z } from 'zod';

export const searchUsersRequestSchema = z.object({
  query: z.object({
    query: z.string().trim().max(190, 'Must contain at most 190 characters').optional().default(''),
    limit: z.coerce.number().int().positive().max(50).optional().default(20)
  })
});

export type SearchUsersRequest = z.output<typeof searchUsersRequestSchema>;
