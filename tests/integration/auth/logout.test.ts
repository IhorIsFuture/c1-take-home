import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';
import { listStoredAuthSessions } from '../../support/database/mysql-test-store';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('POST /api/auth/logout', () => {
  it('revokes the refresh session and clears the cookie', async () => {
    const fixture = await createRegisteredUser();
    const staleClient = fixture.client.fork();
    const response = await fixture.client.request<void>('/api/auth/logout', {
      method: 'POST'
    });

    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
    expect(fixture.client.getCookie('relay_refresh')).toBeUndefined();

    const sessions = await listStoredAuthSessions(fixture.auth.user.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.revokedAt).toBeInstanceOf(Date);
    expect(sessions[0]?.lastUsedAt).toBeInstanceOf(Date);

    const staleRefresh = await staleClient.request<ApiErrorResponse>('/api/auth/refresh', {
      method: 'POST'
    });
    expect(staleRefresh.status).toBe(401);
    expect(staleRefresh.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('is idempotent without a refresh cookie', async () => {
    const response = await new TestHttpClient().request<void>('/api/auth/logout', {
      method: 'POST'
    });

    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
