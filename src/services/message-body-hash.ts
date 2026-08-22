import crypto from 'node:crypto';

export function hashMessageBody(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}
