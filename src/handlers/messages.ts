import type { ValidatedHandler } from '../middleware/validate-request';
import { requireAuth } from '../middleware/authenticate';
import type { RateLimiter } from '../rate-limit/redis-rate-limiter';
import type { RealtimePublisher } from '../realtime/index';
import { createMessage } from '../services/messages';
import type { CreateMessageRequest } from '../validation/messages';

export function createMessageHandler(
  realtimePublisher: RealtimePublisher,
  rateLimiter: RateLimiter
): ValidatedHandler<CreateMessageRequest> {
  return async ({ body: { conversationId, body, clientId } }, { request, response }) => {
    const { userId } = requireAuth(request);
    const result = await createMessage(
      userId,
      { conversationId, body, clientId },
      realtimePublisher,
      rateLimiter
    );
    response.status(result.created ? 201 : 200).json(result.message);
  };
}
