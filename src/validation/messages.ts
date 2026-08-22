import { z } from 'zod';
import { positiveIntegerSchema, requiredStringSchema } from './common';

export const listMessagesRequestSchema = z.object({
  query: z.object({
    conversationId: positiveIntegerSchema
  })
});

export type ListMessagesRequest = z.output<typeof listMessagesRequestSchema>;

export const createMessageRequestSchema = z.object({
  body: z.object({
    conversationId: positiveIntegerSchema,
    body: requiredStringSchema(4000),
    clientId: z.string().uuid('Must be a valid UUID')
  })
});

export type CreateMessageRequest = z.output<typeof createMessageRequestSchema>;
