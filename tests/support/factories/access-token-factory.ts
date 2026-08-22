import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { testEnvironment } from '../test-environment';

const secret = new TextEncoder().encode(testEnvironment.accessTokenSecret);

export async function createExpiredAccessToken(userId: number): Promise<string> {
  return new SignJWT({ sessionId: randomUUID() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(userId))
    .setIssuer(testEnvironment.accessTokenIssuer)
    .setAudience(testEnvironment.accessTokenAudience)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(secret);
}
