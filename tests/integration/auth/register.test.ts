import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse, AuthResponse } from '../../support/contracts/auth-contract';
import {
  countStoredUsers,
  findStoredUserByEmail,
  listStoredAuthSessions
} from '../../support/database/mysql-test-store';
import { buildRegisterUserInput } from '../../support/factories/user-factory';

describe('POST /api/auth/register', () => {
  it('creates a normalized user, hashes the password and starts a session', async () => {
    const client = new TestHttpClient();
    const input = buildRegisterUserInput({
      name: '  Alice Integration  ',
      email: '  ALICE.INTEGRATION@Example.COM  '
    });
    const response = await client.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      json: input
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        id: expect.any(Number),
        name: 'Alice Integration',
        email: 'alice.integration@example.com'
      },
      accessToken: expect.any(String)
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).not.toHaveProperty('password');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');

    const setCookie = response.headers.get('set-cookie')?.toLowerCase();
    expect(setCookie).toContain('relay_refresh=');
    expect(setCookie).toContain('httponly');
    expect(setCookie).toContain('samesite=lax');
    expect(setCookie).toContain('path=/api/auth');
    expect(setCookie).not.toContain('secure');
    expect(client.getCookie('relay_refresh')).toEqual(expect.any(String));

    const storedUser = await findStoredUserByEmail('alice.integration@example.com');
    expect(storedUser).not.toBeNull();
    expect(storedUser?.passwordHash).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, storedUser?.passwordHash ?? '')).toBe(true);
    expect(await listStoredAuthSessions(response.body.user.id)).toHaveLength(1);
  });

  it('rejects a duplicate normalized email without creating partial data', async () => {
    const firstClient = new TestHttpClient();
    const input = buildRegisterUserInput({ email: 'duplicate@example.com' });
    const firstResponse = await firstClient.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      json: input
    });

    const secondResponse = await new TestHttpClient().request<ApiErrorResponse>(
      '/api/auth/register',
      {
        method: 'POST',
        json: {
          ...buildRegisterUserInput(),
          email: '  DUPLICATE@EXAMPLE.COM  '
        }
      }
    );

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body).toEqual({
      error: 'An account with this email already exists',
      code: 'EMAIL_ALREADY_REGISTERED'
    });
    expect(await countStoredUsers()).toBe(1);
    expect(await listStoredAuthSessions(firstResponse.body.user.id)).toHaveLength(1);
  });

  it.each([
    {
      name: 'invalid email',
      overrides: { email: 'not-an-email' },
      field: 'body.email'
    },
    {
      name: 'short password',
      overrides: { password: 'short', passwordConfirmation: 'short' },
      field: 'body.password'
    },
    {
      name: 'mismatched password confirmation',
      overrides: { passwordConfirmation: 'Different123!' },
      field: 'body.passwordConfirmation'
    }
  ])('rejects $name', async ({ overrides, field }) => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/auth/register', {
      method: 'POST',
      json: buildRegisterUserInput(overrides)
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })])
    );
    expect(await countStoredUsers()).toBe(0);
  });
});
