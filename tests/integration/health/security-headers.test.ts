import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse } from '../../support/contracts/auth-contract';

describe('security headers', () => {
  it('sets hardening headers on every response and hides the framework banner', async () => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/conversations');

    expect(response.status).toBe(401);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});
