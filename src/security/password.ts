import bcrypt from 'bcrypt';
import { config } from '../config';

const dummyPasswordHash = await bcrypt.hash('relay-missing-user-password', config.auth.bcryptCost);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptCost);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function verifyPasswordForMissingUser(password: string): Promise<boolean> {
  return bcrypt.compare(password, dummyPasswordHash);
}
