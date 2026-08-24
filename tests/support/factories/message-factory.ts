import { randomUUID } from 'node:crypto';
import type { CreateMessageInput } from '../contracts/message-contract';

let sequence = 0;

export function buildCreateMessageInput(
  conversationId: number,
  overrides: Partial<CreateMessageInput> = {}
): CreateMessageInput {
  sequence += 1;

  return {
    conversationId,
    body: 'Test message ' + sequence,
    clientId: randomUUID(),
    ...overrides
  };
}
