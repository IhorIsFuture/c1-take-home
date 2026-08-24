import { UniqueConstraintError, type Transaction } from 'sequelize';
import { config } from '../config';
import { sequelize } from '../db/mysql';
import { HttpError } from '../errors/http-error';
import { RateLimitError } from '../errors/rate-limit-error';
import type { RateLimiter } from '../rate-limit/redis-rate-limiter';
import { authSessionRepository } from '../repositories/auth-session-repository';
import { userRepository, type PublicUser } from '../repositories/user-repository';
import { createAccessToken } from '../security/access-token';
import { hashPassword, verifyPassword, verifyPasswordForMissingUser } from '../security/password';
import { createRefreshToken, hashRefreshToken } from '../security/refresh-token';

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

async function createSession(user: PublicUser, transaction?: Transaction): Promise<AuthResult> {
  const refreshToken = createRefreshToken();

  await authSessionRepository.create(
    {
      id: refreshToken.sessionId,
      userId: user.id,
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt
    },
    transaction
  );

  return {
    user,
    accessToken: await createAccessToken({ userId: user.id, sessionId: refreshToken.sessionId }),
    refreshToken: refreshToken.token
  };
}

function invalidCredentials(): HttpError {
  return new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
}

async function requireAuthAttempt(
  rateLimiter: RateLimiter,
  action: string,
  email: string
): Promise<void> {
  const decision = await rateLimiter.consume(
    `auth:${action}:${email.trim().toLowerCase()}`,
    config.rateLimit.auth
  );

  if (!decision.allowed) {
    throw new RateLimitError('Too many attempts, try again later', decision.retryAfterSeconds);
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
  rateLimiter: RateLimiter
): Promise<AuthResult> {
  await requireAuthAttempt(rateLimiter, 'register', email);
  const passwordHash = await hashPassword(password);

  try {
    return await sequelize.transaction(async transaction => {
      const user = await userRepository.create({ name, email, passwordHash }, transaction);
      return createSession(user, transaction);
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new HttpError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists'
      );
    }

    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string,
  rateLimiter: RateLimiter
): Promise<AuthResult> {
  await requireAuthAttempt(rateLimiter, 'login', email);
  const user = await userRepository.findByNormalizedEmail(email);

  if (!user) {
    await verifyPasswordForMissingUser(password);
    throw invalidCredentials();
  }

  if (!(await verifyPassword(password, user.passwordHash))) throw invalidCredentials();

  return createSession({ id: user.id, name: user.name, email: user.email });
}

export async function refreshSession(token: string): Promise<AuthResult> {
  const nextRefreshToken = createRefreshToken();
  const session = await authSessionRepository.rotate(hashRefreshToken(token), {
    id: nextRefreshToken.sessionId,
    tokenHash: nextRefreshToken.tokenHash,
    expiresAt: nextRefreshToken.expiresAt
  });

  if (!session) {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }

  return {
    user: session.user,
    accessToken: await createAccessToken({
      userId: session.userId,
      sessionId: session.id
    }),
    refreshToken: nextRefreshToken.token
  };
}

export async function logoutSession(token: string | null): Promise<void> {
  if (!token) return;
  await authSessionRepository.revokeByTokenHash(hashRefreshToken(token));
}

export async function getCurrentUser(userId: number): Promise<PublicUser> {
  const user = await userRepository.findPublicById(userId);

  if (!user) throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');

  return user;
}
