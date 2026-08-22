import type { ValidatedHandler } from '../middleware/validate-request';
import { requireAuth } from '../middleware/authenticate';
import { createConversation, listConversations } from '../services/conversations';
import type {
  CreateConversationRequest,
  ListConversationsRequest
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
