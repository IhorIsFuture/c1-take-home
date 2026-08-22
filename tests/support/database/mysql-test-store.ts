import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { testEnvironment } from '../test-environment';

const applicationTables = [
  'auth_sessions',
  'messages',
  'conversation_participants',
  'conversations',
  'users'
] as const;

interface StoredUserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface AuthSessionRow extends RowDataPacket {
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface StoredUser {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

export interface StoredAuthSession {
  id: string;
  userId: number;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= createPool({
    uri: testEnvironment.mysqlUrl,
    connectionLimit: 2,
    timezone: 'Z'
  });

  return pool;
}

export async function resetMysqlTestData(): Promise<void> {
  const connection = await getPool().getConnection();

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    try {
      for (const table of applicationTables) {
        await connection.query('TRUNCATE TABLE ' + table);
      }
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  } finally {
    connection.release();
  }
}

export async function findStoredUserByEmail(email: string): Promise<StoredUser | null> {
  const [rows] = await getPool().query<StoredUserRow[]>(
    'SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  return rows[0] ?? null;
}

export async function countStoredUsers(): Promise<number> {
  const [rows] = await getPool().query<(RowDataPacket & { count: number })[]>(
    'SELECT COUNT(*) AS count FROM users'
  );

  return rows[0]?.count ?? 0;
}

export async function listStoredAuthSessions(userId: number): Promise<StoredAuthSession[]> {
  const [rows] = await getPool().query<AuthSessionRow[]>(
    'SELECT id, user_id AS userId, refresh_token_hash AS refreshTokenHash, expires_at AS expiresAt, revoked_at AS revokedAt, replaced_by_session_id AS replacedBySessionId, created_at AS createdAt, last_used_at AS lastUsedAt FROM auth_sessions WHERE user_id = ? ORDER BY created_at ASC, id ASC',
    [userId]
  );

  return rows;
}

export async function closeMysqlTestStore(): Promise<void> {
  if (!pool) return;

  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
