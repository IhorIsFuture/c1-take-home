import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { testEnvironment } from '../test-environment';

const applicationTables = [
  'auth_sessions',
  'message_outbox',
  'message_bodies',
  'messages',
  'conversation_summaries',
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

interface StoredConversationRow extends RowDataPacket {
  id: number;
  createdByUserId: number;
  clientId: string;
  title: string;
  createdAt: Date;
}

interface StoredMessageRow extends RowDataPacket {
  id: number;
  conversationId: number;
  senderId: number;
  clientId: string | null;
  bodyHash: string;
  createdAt: Date;
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

export interface StoredConversation {
  id: number;
  createdByUserId: number;
  clientId: string;
  title: string;
  createdAt: Date;
}

export interface StoredMessage {
  id: number;
  conversationId: number;
  senderId: number;
  clientId: string | null;
  bodyHash: string;
  createdAt: Date;
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

export async function findStoredConversation(
  createdByUserId: number,
  clientId: string
): Promise<StoredConversation | null> {
  const [rows] = await getPool().query<StoredConversationRow[]>(
    'SELECT id, created_by_user_id AS createdByUserId, client_id AS clientId, title, created_at AS createdAt FROM conversations WHERE created_by_user_id = ? AND client_id = ? LIMIT 1',
    [createdByUserId, clientId]
  );

  return rows[0] ?? null;
}

export async function countStoredConversations(): Promise<number> {
  const [rows] = await getPool().query<(RowDataPacket & { count: number })[]>(
    'SELECT COUNT(*) AS count FROM conversations'
  );

  return rows[0]?.count ?? 0;
}

export async function listStoredParticipantIds(conversationId: number): Promise<number[]> {
  const [rows] = await getPool().query<(RowDataPacket & { userId: number })[]>(
    'SELECT user_id AS userId FROM conversation_participants WHERE conversation_id = ? ORDER BY user_id ASC',
    [conversationId]
  );

  return rows.map(row => row.userId);
}

export async function findStoredMessage(
  conversationId: number,
  senderId: number,
  clientId: string
): Promise<StoredMessage | null> {
  const [rows] = await getPool().query<StoredMessageRow[]>(
    'SELECT id, conversation_id AS conversationId, sender_id AS senderId, client_id AS clientId, body_hash AS bodyHash, created_at AS createdAt FROM messages WHERE conversation_id = ? AND sender_id = ? AND client_id = ? LIMIT 1',
    [conversationId, senderId, clientId]
  );

  return rows[0] ?? null;
}

export async function listStoredMessages(conversationId: number): Promise<StoredMessage[]> {
  const [rows] = await getPool().query<StoredMessageRow[]>(
    'SELECT id, conversation_id AS conversationId, sender_id AS senderId, client_id AS clientId, body_hash AS bodyHash, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY id ASC',
    [conversationId]
  );

  return rows;
}

export async function countStoredMessages(): Promise<number> {
  const [rows] = await getPool().query<(RowDataPacket & { count: number })[]>(
    'SELECT COUNT(*) AS count FROM messages'
  );

  return rows[0]?.count ?? 0;
}

export interface StoredMessageBodyRow {
  messageId: number;
  body: string;
}

export interface StoredOutboxRow {
  id: number;
  eventId: string;
  eventType: string;
  messageId: number;
  conversationId: number;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  availableAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface StoredConversationSummary {
  conversationId: number;
  lastMessageId: number | null;
  lastMessageAt: Date | null;
  lastSenderId: number | null;
  lastMessagePreview: string | null;
}

export interface StoredParticipantState {
  lastReadMessageId: number | null;
  unreadCount: number;
}

interface MessageBodyRowPacket extends RowDataPacket {
  messageId: number;
  body: string;
}

interface OutboxRowPacket extends RowDataPacket {
  id: number;
  eventId: string;
  eventType: string;
  messageId: number;
  conversationId: number;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  availableAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
}

interface ConversationSummaryPacket extends RowDataPacket {
  conversationId: number;
  lastMessageId: number | null;
  lastMessageAt: Date | null;
  lastSenderId: number | null;
  lastMessagePreview: string | null;
}

interface ParticipantStatePacket extends RowDataPacket {
  lastReadMessageId: number | null;
  unreadCount: number;
}

const outboxSelect =
  'SELECT id, event_id AS eventId, event_type AS eventType, message_id AS messageId, ' +
  'conversation_id AS conversationId, status, attempts, available_at AS availableAt, ' +
  'published_at AS publishedAt, created_at AS createdAt ' +
  'FROM message_outbox';

export async function findStoredMessageBodyRow(
  messageId: number
): Promise<StoredMessageBodyRow | null> {
  const [rows] = await getPool().query<MessageBodyRowPacket[]>(
    'SELECT message_id AS messageId, body FROM message_bodies WHERE message_id = ? LIMIT 1',
    [messageId]
  );

  return rows[0] ?? null;
}

export async function countStoredMessageBodyRows(): Promise<number> {
  const [rows] = await getPool().query<(RowDataPacket & { count: number })[]>(
    'SELECT COUNT(*) AS count FROM message_bodies'
  );

  return rows[0]?.count ?? 0;
}

export async function listOutboxRows(): Promise<StoredOutboxRow[]> {
  const [rows] = await getPool().query<OutboxRowPacket[]>(outboxSelect + ' ORDER BY id');
  return rows;
}

export async function findOutboxRowByEventId(eventId: string): Promise<StoredOutboxRow | null> {
  const [rows] = await getPool().query<OutboxRowPacket[]>(
    outboxSelect + ' WHERE event_id = ? LIMIT 1',
    [eventId]
  );

  return rows[0] ?? null;
}

export async function countOutboxRows(status?: StoredOutboxRow['status']): Promise<number> {
  const [rows] = status
    ? await getPool().query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) AS count FROM message_outbox WHERE status = ?',
        [status]
      )
    : await getPool().query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) AS count FROM message_outbox'
      );

  return rows[0]?.count ?? 0;
}

export async function updateOutboxRow(
  id: number,
  patch: Partial<Pick<StoredOutboxRow, 'status' | 'attempts'>> & {
    availableAt?: Date;
    publishedAt?: Date | null;
  }
): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (patch.status !== undefined) {
    assignments.push('status = ?');
    values.push(patch.status);
  }

  if (patch.attempts !== undefined) {
    assignments.push('attempts = ?');
    values.push(patch.attempts);
  }

  if (patch.availableAt !== undefined) {
    assignments.push('available_at = ?');
    values.push(patch.availableAt);
  }

  if (patch.publishedAt !== undefined) {
    assignments.push('published_at = ?');
    values.push(patch.publishedAt);
  }

  if (!assignments.length) return;

  values.push(id);
  await getPool().query(
    'UPDATE message_outbox SET ' + assignments.join(', ') + ' WHERE id = ?',
    values
  );
}

export async function insertOutboxRow(row: {
  eventId: string;
  eventType: string;
  messageId: number;
  conversationId: number;
  status: StoredOutboxRow['status'];
  attempts?: number;
  availableAt?: Date;
  publishedAt?: Date | null;
  createdAt?: Date;
}): Promise<number> {
  const [result] = await getPool().query(
    'INSERT INTO message_outbox (event_id, event_type, message_id, conversation_id, status, ' +
      'attempts, available_at, published_at, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      row.eventId,
      row.eventType,
      row.messageId,
      row.conversationId,
      row.status,
      row.attempts ?? 0,
      row.availableAt ?? new Date(),
      row.publishedAt ?? null,
      row.createdAt ?? new Date()
    ]
  );

  return (result as { insertId: number }).insertId;
}

export async function findConversationSummary(
  conversationId: number
): Promise<StoredConversationSummary | null> {
  const [rows] = await getPool().query<ConversationSummaryPacket[]>(
    'SELECT conversation_id AS conversationId, last_message_id AS lastMessageId, ' +
      'last_message_at AS lastMessageAt, last_sender_id AS lastSenderId, ' +
      'last_message_preview AS lastMessagePreview ' +
      'FROM conversation_summaries WHERE conversation_id = ? LIMIT 1',
    [conversationId]
  );

  return rows[0] ?? null;
}

export async function findParticipantState(
  conversationId: number,
  userId: number
): Promise<StoredParticipantState | null> {
  const [rows] = await getPool().query<ParticipantStatePacket[]>(
    'SELECT last_read_message_id AS lastReadMessageId, unread_count AS unreadCount ' +
      'FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId]
  );

  return rows[0] ?? null;
}

export async function closeMysqlTestStore(): Promise<void> {
  if (!pool) return;

  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
