import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse, AuthResponse } from '../../support/contracts/auth-contract';
import { listStoredAuthSessions } from '../../support/database/mysql-test-store';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and links the replacement session', async () => {
    const fixture = await createRegisteredUser();
    const previousRefreshToken = fixture.client.getCookie('relay_refresh');
    const response = await fixture.client.request<AuthResponse>('/api/auth/refresh', {
      method: 'POST'
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(fixture.auth.user);
    expect(response.body.accessToken).not.toBe(fixture.auth.accessToken);
    expect(fixture.client.getCookie('relay_refresh')).not.toBe(previousRefreshToken);

    const sessions = await listStoredAuthSessions(fixture.auth.user.id);
    const revokedSession = sessions.find(session => session.revokedAt);
    const activeSession = sessions.find(session => !session.revokedAt);

    expect(sessions).toHaveLength(2);
    expect(revokedSession).toBeDefined();
    expect(activeSession).toBeDefined();
    expect(revokedSession?.replacedBySessionId).toBe(activeSession?.id);
    expect(revokedSession?.lastUsedAt).toBeInstanceOf(Date);
  });

  it('rejects reuse of a rotated refresh token', async () => {
    const fixture = await createRegisteredUser();
    const staleClient = fixture.client.fork();

    const firstRefresh = await fixture.client.request<AuthResponse>('/api/auth/refresh', {
      method: 'POST'
    });
    const staleRefresh = await staleClient.request<ApiErrorResponse>('/api/auth/refresh', {
      method: 'POST'
    });

    expect(firstRefresh.status).toBe(200);
    expect(staleRefresh.status).toBe(401);
    expect(staleRefresh.body.code).toBe('INVALID_REFRESH_TOKEN');
    expect(staleClient.getCookie('relay_refresh')).toBeUndefined();
  });

  it('allows only one concurrent refresh for the same token', async () => {
    const fixture = await createRegisteredUser();
    const firstClient = fixture.client.fork();
    const secondClient = fixture.client.fork();

    const responses = await Promise.all([
      firstClient.request<AuthResponse | ApiErrorResponse>('/api/auth/refresh', {
        method: 'POST'
      }),
      secondClient.request<AuthResponse | ApiErrorResponse>('/api/auth/refresh', {
        method: 'POST'
      })
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);

    const sessions = await listStoredAuthSessions(fixture.auth.user.id);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter(session => !session.revokedAt)).toHaveLength(1);
    expect(sessions.filter(session => session.revokedAt)).toHaveLength(1);
  });

  it.each([
    { name: 'missing token', refreshToken: undefined },
    { name: 'invalid token', refreshToken: 'invalid-refresh-token' }
  ])('rejects a $name and clears the cookie', async ({ refreshToken }) => {
    const client = new TestHttpClient();
    if (refreshToken) client.setCookie('relay_refresh', refreshToken);

    const response = await client.request<ApiErrorResponse>('/api/auth/refresh', {
      method: 'POST'
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_REFRESH_TOKEN');
    expect(client.getCookie('relay_refresh')).toBeUndefined();
    expect(response.headers.get('set-cookie')?.toLowerCase()).toContain('relay_refresh=');
  });
});
