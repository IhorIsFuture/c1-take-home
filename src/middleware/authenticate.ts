import type { Request, RequestHandler } from 'express';
import { HttpError } from '../errors/http-error';
import { verifyAccessToken, type AuthContext } from '../security/access-token';

function unauthorized(): HttpError {
  return new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
}

export const authenticate: RequestHandler = async (request, _response, next) => {
  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer[ \t]+([^\s]+)$/i);

  if (!match) {
    next(unauthorized());
    return;
  }

  const auth = await verifyAccessToken(match[1]);

  if (!auth) {
    next(unauthorized());
    return;
  }

  request.auth = auth;
  next();
};

export function requireAuth(request: Request): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
