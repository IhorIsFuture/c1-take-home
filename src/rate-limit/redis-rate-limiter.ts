import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';

const consumeScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.ceil(tonumber(oldest[2]) + tonumber(ARGV[2]) - tonumber(ARGV[1]))}
end
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
return {1, 0}
`;

type RedisClient = ReturnType<typeof createClient>;

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(scope: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

export interface RedisRateLimiterOptions {
  url: string;
  namespace: string;
  onError?: (error: unknown) => void;
}

const allowedDecision: RateLimitDecision = { allowed: true, retryAfterSeconds: 0 };

export class RedisRateLimiter implements RateLimiter {
  private readonly client: RedisClient;
  private readonly keyPrefix: string;
  private readonly reportError: (error: unknown) => void;
  private startPromise?: Promise<void>;
  private closePromise?: Promise<void>;

  constructor(options: RedisRateLimiterOptions) {
    this.client = createClient({ url: options.url });
    this.keyPrefix = `${options.namespace}:rate`;
    this.reportError =
      options.onError ?? (error => console.error('Redis rate limiter error', error));
    this.client.on('error', this.reportError);
  }

  start(): Promise<void> {
    if (this.closePromise) throw new Error('Redis rate limiter is closing');
    this.startPromise ??= this.client.connect().then(() => undefined);
    return this.startPromise;
  }

  close(): Promise<void> {
    this.closePromise ??= this.client.isOpen
      ? this.client.quit().then(() => undefined)
      : Promise.resolve();
    return this.closePromise;
  }

  async consume(scope: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    if (!this.client.isReady) return allowedDecision;

    try {
      const result = (await this.client.eval(consumeScript, {
        keys: [`${this.keyPrefix}:${scope}`],
        arguments: [
          String(Date.now()),
          String(rule.windowSeconds * 1000),
          String(rule.limit),
          `${Date.now()}:${randomUUID()}`
        ]
      })) as [number, number];

      if (result[0] === 1) return allowedDecision;

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(result[1] / 1000))
      };
    } catch (error) {
      this.reportError(error);
      return allowedDecision;
    }
  }
}
