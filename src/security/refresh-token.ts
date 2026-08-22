import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { parseCookie } from 'cookie';
import { config } from '../config';

export interface NewRefreshToken {
  sessionId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createRefreshToken(): NewRefreshToken {
  const token = randomBytes(32).toString('base64url');

  return {
    sessionId: randomUUID(),
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + config.auth.refreshTokenTtlSeconds * 1000)
  };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readRefreshToken(request: Request): string | null {
  const cookies = parseCookie(request.headers.cookie ?? '');
  return cookies[config.auth.refreshCookieName] ?? null;
}

export function setRefreshTokenCookie(response: Response, token: string): void {
  response.cookie(config.auth.refreshCookieName, token, {
    httpOnly: true,
    secure: config.auth.secureCookies,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: config.auth.refreshTokenTtlSeconds * 1000
  });
}

export function clearRefreshTokenCookie(response: Response): void {
  response.clearCookie(config.auth.refreshCookieName, {
    httpOnly: true,
    secure: config.auth.secureCookies,
    sameSite: 'lax',
    path: '/api/auth'
  });
}
