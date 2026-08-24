import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse, PublicUser } from '../../support/contracts/auth-contract';
import { createExpiredAccessToken } from '../../support/factories/access-token-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('GET /api/users/me', () => {
  it('returns the authenticated user', async () => {
    const fixture = await createRegisteredUser();
    const response = await fixture.client.request<PublicUser>('/api/users/me', {
      accessToken: fixture.auth.accessToken
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(fixture.auth.user);
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it.each([
    { name: 'a missing access token', accessToken: undefined },
    { name: 'an invalid access token', accessToken: 'invalid-access-token' }
  ])('rejects $name', async ({ accessToken }) => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/users/me', {
      accessToken
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED'
    });
  });

  it('rejects an expired access token', async () => {
    const fixture = await createRegisteredUser();
    const expiredAccessToken = await createExpiredAccessToken(fixture.auth.user.id);
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/users/me', {
      accessToken: expiredAccessToken
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
