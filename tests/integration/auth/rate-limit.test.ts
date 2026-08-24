import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse, AuthResponse } from '../../support/contracts/auth-contract';
import { buildRegisterUserInput } from '../../support/factories/user-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

const attempts = 10;

describe('authentication rate limiting', () => {
  it('throttles repeated login attempts per email with Retry-After', async () => {
    const user = await createRegisteredUser();
    const client = new TestHttpClient();

    for (let index = 0; index < attempts; index += 1) {
      const attempt = await client.request<ApiErrorResponse>('/api/auth/login', {
        method: 'POST',
        json: { email: user.input.email, password: 'WrongPassword1!' }
      });

      expect(attempt.status).toBe(401);
    }

    const throttled = await client.request<ApiErrorResponse>('/api/auth/login', {
      method: 'POST',
      json: { email: user.input.email, password: 'WrongPassword1!' }
    });

    expect(throttled.status).toBe(429);
    expect(throttled.body.code).toBe('RATE_LIMITED');
    expect(Number(throttled.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);

    const otherUser = await client.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      json: { email: 'someone-else@example.com', password: 'WrongPassword1!' }
    });

    expect(otherUser.status).toBe(401);
  });

  it('throttles repeated registrations for the same email', async () => {
    const client = new TestHttpClient();
    const input = buildRegisterUserInput();

    for (let index = 0; index < attempts; index += 1) {
      const attempt = await client.request<ApiErrorResponse>('/api/auth/register', {
        method: 'POST',
        json: input
      });

      expect(attempt.status).toBe(index === 0 ? 201 : 409);
    }

    const throttled = await client.request<ApiErrorResponse>('/api/auth/register', {
      method: 'POST',
      json: input
    });

    expect(throttled.status).toBe(429);
    expect(throttled.body.code).toBe('RATE_LIMITED');
  });
});
