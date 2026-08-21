import { z } from 'zod';
import { positiveIntegerSchema, requiredStringSchema } from './common';

export const listConversationsRequestSchema = z.object({
  query: z.object({
    userId: positiveIntegerSchema
  })
});

export type ListConversationsRequest = z.output<typeof listConversationsRequestSchema>;

export const createConversationRequestSchema = z.object({
  body: z.object({
    title: requiredStringSchema(200),
    participantIds: z
      .array(positiveIntegerSchema)
      .min(1, 'Must contain at least one participant')
      .transform(participantIds => [...new Set(participantIds)])
  })
});

export type CreateConversationRequest = z.output<typeof createConversationRequestSchema>;
