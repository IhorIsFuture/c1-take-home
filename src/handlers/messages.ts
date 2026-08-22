import type { ValidatedHandler } from '../middleware/validate-request';
import { requireAuth } from '../middleware/authenticate';
import { createMessage, listMessages } from '../services/messages';
import type { CreateMessageRequest, ListMessagesRequest } from '../validation/messages';

export const createMessageHandler: ValidatedHandler<CreateMessageRequest> = async (
  { body: { conversationId, body, clientId } },
  { request, response }
) => {
  const { userId } = requireAuth(request);
  const result = await createMessage(userId, { conversationId, body, clientId });
  response.status(result.created ? 201 : 200).json(result.message);
};

export const listMessagesHandler: ValidatedHandler<ListMessagesRequest> = async (
  { query: { conversationId } },
  { request, response }
) => {
  const { userId } = requireAuth(request);
  response.json(await listMessages(userId, conversationId));
};
