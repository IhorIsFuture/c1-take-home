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
    senderId: positiveIntegerSchema,
    body: requiredStringSchema(4000),
    clientId: requiredStringSchema(64)
      .nullish()
      .transform(clientId => clientId ?? null)
  })
});

export type CreateMessageRequest = z.output<typeof createMessageRequestSchema>;
