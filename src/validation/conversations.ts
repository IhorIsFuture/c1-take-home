import { z } from 'zod';
import { positiveIntegerSchema, requiredStringSchema } from './common';

export const listConversationsRequestSchema = z.object({});

export type ListConversationsRequest = z.output<typeof listConversationsRequestSchema>;

export const createConversationRequestSchema = z.object({
  body: z.object({
    title: requiredStringSchema(200),
    participantIds: z
      .array(positiveIntegerSchema)
      .min(1, 'Must contain at least one participant')
      .max(100, 'Must contain at most 100 participants')
      .transform(participantIds => [...new Set(participantIds)]),
    clientId: z.string().uuid('Must be a valid UUID')
  })
});

export type CreateConversationRequest = z.output<typeof createConversationRequestSchema>;
