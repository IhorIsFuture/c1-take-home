import { z } from 'zod';
import { positiveBigIntegerSchema, positiveIntegerSchema, requiredStringSchema } from './common';

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
    clientId: z.uuid('Must be a valid UUID')
  })
});

export type CreateConversationRequest = z.output<typeof createConversationRequestSchema>;

export const listConversationMessagesRequestSchema = z.object({
  params: z.object({
    conversationId: positiveIntegerSchema
  }),
  query: z.object({
    beforeId: positiveBigIntegerSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30)
  })
});

export type ListConversationMessagesRequest = z.output<
  typeof listConversationMessagesRequestSchema
>;

export const markConversationReadRequestSchema = z.object({
  params: z.object({
    conversationId: positiveIntegerSchema
  }),
  body: z.object({
    throughMessageId: positiveBigIntegerSchema
  })
});

export type MarkConversationReadRequest = z.output<typeof markConversationReadRequestSchema>;
