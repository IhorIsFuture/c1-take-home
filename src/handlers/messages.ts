import type { ValidatedHandler } from '../middleware/validate-request';
import { createMessage, listMessages } from '../services/messages';
import type { CreateMessageRequest, ListMessagesRequest } from '../validation/messages';

export const createMessageHandler: ValidatedHandler<CreateMessageRequest> = async (
  { body: { conversationId, senderId, body, clientId } },
  { response }
) => {
  const result = await createMessage({ conversationId, senderId, body, clientId });
  response.status(result.created ? 201 : 200).json(result.message);
};

export const listMessagesHandler: ValidatedHandler<ListMessagesRequest> = async (
  { query: { conversationId } },
  { response }
) => {
  response.json(await listMessages(conversationId));
};
