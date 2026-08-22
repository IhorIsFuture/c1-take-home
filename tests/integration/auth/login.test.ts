import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse, AuthResponse } from '../../support/contracts/auth-contract';
import { listStoredAuthSessions } from '../../support/database/mysql-test-store';
import { buildRegisterUserInput } from '../../support/factories/user-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('POST /api/auth/login', () => {
  it('authenticates by normalized email and creates a new session', async () => {
    const fixture = await createRegisteredUser(
      buildRegisterUserInput({ email: 'login@example.com' })
    );
    const client = new TestHttpClient();
    const response = await client.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      json: {
        email: '  LOGIN@EXAMPLE.COM  ',
        password: fixture.input.password
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(fixture.auth.user);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.accessToken).not.toBe(fixture.auth.accessToken);
    expect(client.getCookie('relay_refresh')).toEqual(expect.any(String));
    expect(await listStoredAuthSessions(fixture.auth.user.id)).toHaveLength(2);
  });

  it('returns the same error for a wrong password without creating a session', async () => {
    const fixture = await createRegisteredUser();
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/auth/login', {
      method: 'POST',
      json: {
        email: fixture.input.email,
        password: 'WrongPassword123!'
      }
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    });
    expect(await listStoredAuthSessions(fixture.auth.user.id)).toHaveLength(1);
  });

  it('returns the same error for an unknown email', async () => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/auth/login', {
      method: 'POST',
      json: {
        email: 'missing@example.com',
        password: 'WrongPassword123!'
      }
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    });
  });
});
