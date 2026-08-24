import { randomUUID } from 'node:crypto';
import type { CreateConversationInput } from '../contracts/conversation-contract';

let sequence = 0;

export function buildCreateConversationInput(
  participantIds: number[],
  overrides: Partial<CreateConversationInput> = {}
): CreateConversationInput {
  sequence += 1;

  return {
    title: 'Test Conversation ' + sequence,
    participantIds,
    clientId: randomUUID(),
    ...overrides
  };
}
