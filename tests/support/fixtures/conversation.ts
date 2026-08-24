import type {
  CreateConversationInput,
  CreatedConversation
} from '../contracts/conversation-contract';
import { buildCreateConversationInput } from '../factories/conversation-factory';
import type { RegisteredUserFixture } from './registered-user';

export interface ConversationFixture {
  input: CreateConversationInput;
  conversation: CreatedConversation;
}

export async function createConversationFixture(
  actor: RegisteredUserFixture,
  participantIds: number[],
  overrides: Partial<CreateConversationInput> = {}
): Promise<ConversationFixture> {
  const input = buildCreateConversationInput(participantIds, overrides);
  const response = await actor.client.request<CreatedConversation>('/api/conversations', {
    method: 'POST',
    accessToken: actor.auth.accessToken,
    json: input
  });

  if (response.status !== 201) {
    throw new Error('Could not create conversation fixture: HTTP ' + response.status);
  }

  return {
    input,
    conversation: response.body
  };
}
