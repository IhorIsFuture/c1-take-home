import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config';

export interface AuthContext {
  userId: number;
  sessionId: string;
}

const secret = new TextEncoder().encode(config.auth.accessTokenSecret);

export async function createAccessToken(auth: AuthContext): Promise<string> {
  return new SignJWT({ sessionId: auth.sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(auth.userId))
    .setIssuer(config.auth.issuer)
    .setAudience(config.auth.audience)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.auth.accessTokenTtlSeconds)
    .sign(secret);
}

export async function verifyAccessToken(accessToken: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(accessToken, secret, {
      algorithms: ['HS256'],
      issuer: config.auth.issuer,
      audience: config.auth.audience
    });
    const userId = Number(payload.sub);
    const sessionId = payload.sessionId;

    if (!Number.isSafeInteger(userId) || userId <= 0 || typeof sessionId !== 'string') return null;

    return { userId, sessionId };
  } catch {
    return null;
  }
}
