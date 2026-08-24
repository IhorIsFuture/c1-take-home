import { HttpError } from './http-error';

export class RateLimitError extends HttpError {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number
  ) {
    super(429, 'RATE_LIMITED', message);
    this.name = 'RateLimitError';
  }
}
