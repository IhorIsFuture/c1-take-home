import type { ValidatedHandler } from '../middleware/validate-request';
import { createConversation, listConversations } from '../services/conversations';
import type {
  CreateConversationRequest,
  ListConversationsRequest
} from '../validation/conversations';

export const listConversationsHandler: ValidatedHandler<ListConversationsRequest> = async (
  { query: { userId } },
  { response }
) => {
  response.json(await listConversations(userId));
};

export const createConversationHandler: ValidatedHandler<CreateConversationRequest> = async (
  { body: { title, participantIds } },
  { response }
) => {
  response.status(201).json(await createConversation(title, participantIds));
};
