import bcrypt from 'bcrypt';
import { config } from '../config';

const dummyPasswordHash = '$2b$12$Ho.eMFsTE3Ci57tjuxcaaO.SaZCrnwMqGQIZRufnY7/tXmzqxQL1u';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptCost);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function verifyPasswordForMissingUser(password: string): Promise<boolean> {
  return bcrypt.compare(password, dummyPasswordHash);
}
