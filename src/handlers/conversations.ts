import type { ValidatedHandler } from '../middleware/validate-request';
import { requireAuth } from '../middleware/authenticate';
import {
  createConversation,
  listConversations,
  markConversationRead
} from '../services/conversations';
import { listConversationMessages } from '../services/messages';
import type {
  CreateConversationRequest,
  ListConversationMessagesRequest,
  ListConversationsRequest,
  MarkConversationReadRequest
} from '../validation/conversations';

export const listConversationsHandler: ValidatedHandler<ListConversationsRequest> = async (
  _input,
  { request, response }
) => {
  const { userId } = requireAuth(request);
  response.json(await listConversations(userId));
};

export const createConversationHandler: ValidatedHandler<CreateConversationRequest> = async (
  { body: { title, participantIds, clientId } },
  { request, response }
) => {
  const { userId } = requireAuth(request);
  const result = await createConversation(userId, title, participantIds, clientId);
  response.status(result.created ? 201 : 200).json(result.conversation);
};

export const listConversationMessagesHandler: ValidatedHandler<
  ListConversationMessagesRequest
> = async ({ params: { conversationId }, query: { beforeId, limit } }, { request, response }) => {
  const { userId } = requireAuth(request);
  response.json(await listConversationMessages(userId, conversationId, beforeId, limit));
};

export const markConversationReadHandler: ValidatedHandler<MarkConversationReadRequest> = async (
  { params: { conversationId }, body: { throughMessageId } },
  { request, response }
) => {
  const { userId } = requireAuth(request);
  response.json(await markConversationRead(userId, conversationId, throughMessageId));
};
