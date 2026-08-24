import type { RequestHandler } from 'express';
import { HttpError } from '../errors/http-error';
import type { ValidatedHandler } from '../middleware/validate-request';
import type { RateLimiter } from '../rate-limit/redis-rate-limiter';
import { loginUser, logoutSession, refreshSession, registerUser } from '../services/auth';
import {
  clearRefreshTokenCookie,
  readRefreshToken,
  setRefreshTokenCookie
} from '../security/refresh-token';
import type { LoginRequest, RegisterRequest } from '../validation/auth';

export function registerHandler(rateLimiter: RateLimiter): ValidatedHandler<RegisterRequest> {
  return async ({ body: { name, email, password } }, { response }) => {
    const result = await registerUser(name, email, password, rateLimiter);
    setRefreshTokenCookie(response, result.refreshToken);
    response.status(201).json({ user: result.user, accessToken: result.accessToken });
  };
}

export function loginHandler(rateLimiter: RateLimiter): ValidatedHandler<LoginRequest> {
  return async ({ body: { email, password } }, { response }) => {
    const result = await loginUser(email, password, rateLimiter);
    setRefreshTokenCookie(response, result.refreshToken);
    response.json({ user: result.user, accessToken: result.accessToken });
  };
}

export const refreshHandler: RequestHandler = async (request, response) => {
  const refreshToken = readRefreshToken(request);

  if (!refreshToken) {
    clearRefreshTokenCookie(response);
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  try {
    const result = await refreshSession(refreshToken);
    setRefreshTokenCookie(response, result.refreshToken);
    response.json({ user: result.user, accessToken: result.accessToken });
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 401) {
      clearRefreshTokenCookie(response);
    }

    throw error;
  }
};

export const logoutHandler: RequestHandler = async (request, response) => {
  await logoutSession(readRefreshToken(request));
  clearRefreshTokenCookie(response);
  response.status(204).end();
};
