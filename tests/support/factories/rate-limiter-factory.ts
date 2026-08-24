import type { RateLimiter } from '../../../src/rate-limit/redis-rate-limiter';

export const allowAllRateLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 })
};
