import type { Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { authenticateFrameSchema, typingFrameSchema } from './protocol';

const defaultAuthTimeoutMs = 5000;
const defaultHeartbeatIntervalMs = 30000;
const defaultMaxPayloadBytes = 16 * 1024;
const defaultMaxBufferedAmountBytes = 1024 * 1024;
const defaultMaxPendingFrames = 32;
const typingThrottleMs = 1000;
const maxTimerDelayMs = 2147483647;

export interface WsAuthenticatedUser {
  userId: number;
  accessTokenExpiresAt: Date;
}

export interface WsHubOptions {
  verifyAccessToken: (accessToken: string) => Promise<WsAuthenticatedUser | null>;
  onTyping?: (userId: number, conversationId: number) => Promise<void>;
  authTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  maxPayloadBytes?: number;
  maxBufferedAmountBytes?: number;
  maxPendingFrames?: number;
  onError?: (error: unknown) => void;
}

export interface WsHub {
  webSocketServer: WebSocketServer;
  deliver: (recipientUserIds: readonly number[], payload: unknown) => void;
  broadcast: (payload: unknown) => void;
}

type Client = WebSocket & {
  userId?: number;
  authenticated: boolean;
  isAlive: boolean;
  lastTypingSentAt: Map<number, number>;
  authTimer?: ReturnType<typeof setTimeout>;
  accessTokenExpirationTimer?: ReturnType<typeof setTimeout>;
  messageQueue: Promise<void>;
  pendingFrames: number;
  maxBufferedAmountBytes: number;
  reportError: (error: unknown) => void;
};

function decodeFrame(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}

function sendSerialized(client: Client, data: string): boolean {
  if (client.readyState !== WebSocket.OPEN) return false;

  if (client.bufferedAmount > client.maxBufferedAmountBytes) {
    client.terminate();
    return false;
  }

  client.send(data, error => {
    if (!error) return;
    client.reportError(error);
    client.terminate();
  });

  return true;
}

function sendJson(client: Client, payload: unknown): boolean {
  return sendSerialized(client, JSON.stringify(payload));
}

function closeWithError(
  client: Client,
  type: 'auth_error' | 'protocol_error' | 'server_error',
  code: string,
  reason: string,
  closeCode: number
): void {
  sendJson(client, { type, code });
  if (client.readyState === WebSocket.OPEN) client.close(closeCode, reason);
}

function clearAuthenticationTimer(client: Client): void {
  if (!client.authTimer) return;
  clearTimeout(client.authTimer);
  client.authTimer = undefined;
}

function clearAccessTokenExpirationTimer(client: Client): void {
  if (!client.accessTokenExpirationTimer) return;
  clearTimeout(client.accessTokenExpirationTimer);
  client.accessTokenExpirationTimer = undefined;
}

function scheduleAccessTokenExpiration(client: Client, expiresAt: Date): void {
  clearAccessTokenExpirationTimer(client);

  const expireWhenDue = (): void => {
    const remainingMs = expiresAt.getTime() - Date.now();

    if (remainingMs <= 0) {
      closeWithError(client, 'auth_error', 'ACCESS_TOKEN_EXPIRED', 'Access token expired', 4001);
      return;
    }

    client.accessTokenExpirationTimer = setTimeout(
      expireWhenDue,
      Math.min(remainingMs, maxTimerDelayMs)
    );
    client.accessTokenExpirationTimer.unref();
  };

  expireWhenDue();
}

async function authenticateClient(
  client: Client,
  frame: unknown,
  verifyAccessToken: WsHubOptions['verifyAccessToken']
): Promise<WsAuthenticatedUser | null> {
  const result = authenticateFrameSchema.safeParse(frame);

  if (!result.success) {
    closeWithError(
      client,
      'auth_error',
      'AUTHENTICATION_REQUIRED',
      'Authentication required',
      1008
    );
    return null;
  }

  let authenticatedUser: WsAuthenticatedUser | null;

  try {
    authenticatedUser = await verifyAccessToken(result.data.accessToken);
  } catch (error) {
    client.reportError(error);
    closeWithError(client, 'server_error', 'AUTHENTICATION_UNAVAILABLE', 'Server error', 1011);
    return null;
  }

  if (
    !authenticatedUser ||
    !Number.isSafeInteger(authenticatedUser.userId) ||
    authenticatedUser.userId <= 0 ||
    !(authenticatedUser.accessTokenExpiresAt instanceof Date) ||
    !Number.isFinite(authenticatedUser.accessTokenExpiresAt.getTime()) ||
    authenticatedUser.accessTokenExpiresAt.getTime() <= Date.now()
  ) {
    closeWithError(client, 'auth_error', 'INVALID_ACCESS_TOKEN', 'Authentication failed', 1008);
    return null;
  }

  if (client.readyState !== WebSocket.OPEN) return null;

  return authenticatedUser;
}

async function handleAuthenticatedFrame(
  client: Client,
  frame: unknown,
  onTyping: WsHubOptions['onTyping']
): Promise<void> {
  const typingFrame = typingFrameSchema.safeParse(frame);

  if (!typingFrame.success) {
    closeWithError(client, 'protocol_error', 'UNEXPECTED_FRAME', 'Unexpected frame', 1008);
    return;
  }

  if (!client.userId || !onTyping) return;

  const conversationId = typingFrame.data.conversationId;
  const lastSentAt = client.lastTypingSentAt.get(conversationId) ?? 0;
  const now = Date.now();

  if (now - lastSentAt < typingThrottleMs) return;

  client.lastTypingSentAt.set(conversationId, now);

  try {
    await onTyping(client.userId, conversationId);
  } catch (error) {
    client.reportError(error);
  }
}

async function handleFrame(
  client: Client,
  raw: RawData,
  isBinary: boolean,
  verifyAccessToken: WsHubOptions['verifyAccessToken'],
  onTyping: WsHubOptions['onTyping'],
  registerAuthenticatedClient: (client: Client, userId: number) => void
): Promise<void> {
  if (isBinary) {
    closeWithError(client, 'protocol_error', 'TEXT_FRAMES_ONLY', 'Text frames only', 1003);
    return;
  }

  let frame: unknown;

  try {
    frame = JSON.parse(decodeFrame(raw));
  } catch {
    closeWithError(client, 'protocol_error', 'INVALID_JSON', 'Invalid JSON', 1007);
    return;
  }

  if (client.authenticated) {
    await handleAuthenticatedFrame(client, frame, onTyping);
    return;
  }

  const authenticatedUser = await authenticateClient(client, frame, verifyAccessToken);
  if (!authenticatedUser) return;

  registerAuthenticatedClient(client, authenticatedUser.userId);
  client.userId = authenticatedUser.userId;
  client.authenticated = true;
  clearAuthenticationTimer(client);
  scheduleAccessTokenExpiration(client, authenticatedUser.accessTokenExpiresAt);
  sendJson(client, { type: 'authenticated' });
}

export function attachWs(server: Server, options: WsHubOptions): WsHub {
  const verifyAccessToken = options.verifyAccessToken;
  const onTyping = options.onTyping;
  const authTimeoutMs = options.authTimeoutMs ?? defaultAuthTimeoutMs;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs;
  const maxPayloadBytes = options.maxPayloadBytes ?? defaultMaxPayloadBytes;
  const maxBufferedAmountBytes = options.maxBufferedAmountBytes ?? defaultMaxBufferedAmountBytes;
  const maxPendingFrames = options.maxPendingFrames ?? defaultMaxPendingFrames;
  const reportError = options.onError ?? (error => console.error('WebSocket error', error));
  const hubClients = new Set<Client>();
  const clientsByUserId = new Map<number, Set<Client>>();
  const webSocketServer = new WebSocketServer({
    server,
    maxPayload: maxPayloadBytes,
    perMessageDeflate: false
  });

  const cleanup = (client: Client): void => {
    clearAuthenticationTimer(client);
    clearAccessTokenExpirationTimer(client);
    hubClients.delete(client);

    if (!client.userId) return;

    const userClients = clientsByUserId.get(client.userId);
    userClients?.delete(client);
    if (!userClients?.size) clientsByUserId.delete(client.userId);
  };

  const registerAuthenticatedClient = (client: Client, userId: number): void => {
    const userClients = clientsByUserId.get(userId) ?? new Set<Client>();
    userClients.add(client);
    clientsByUserId.set(userId, userClients);
  };

  webSocketServer.on('connection', (socket: WebSocket) => {
    const client = socket as Client;
    client.authenticated = false;
    client.isAlive = true;
    client.lastTypingSentAt = new Map();
    client.messageQueue = Promise.resolve();
    client.pendingFrames = 0;
    client.maxBufferedAmountBytes = maxBufferedAmountBytes;
    client.reportError = reportError;
    client.authTimer = setTimeout(() => {
      closeWithError(
        client,
        'auth_error',
        'AUTHENTICATION_TIMEOUT',
        'Authentication timeout',
        1008
      );
    }, authTimeoutMs);
    client.authTimer.unref();

    hubClients.add(client);

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('message', (raw, isBinary) => {
      client.pendingFrames += 1;

      if (client.pendingFrames > maxPendingFrames) {
        client.pendingFrames -= 1;
        closeWithError(client, 'protocol_error', 'TOO_MANY_FRAMES', 'Too many frames', 1008);
        return;
      }

      client.messageQueue = client.messageQueue
        .then(async () => {
          if (client.readyState !== WebSocket.OPEN) return;
          await handleFrame(
            client,
            raw,
            isBinary,
            verifyAccessToken,
            onTyping,
            registerAuthenticatedClient
          );
        })
        .catch(error => {
          reportError(error);
          closeWithError(client, 'server_error', 'INTERNAL_ERROR', 'Server error', 1011);
        })
        .finally(() => {
          client.pendingFrames -= 1;
        });
    });

    client.on('error', error => {
      reportError(error);
      cleanup(client);
      client.terminate();
    });

    client.on('close', () => cleanup(client));
  });

  const heartbeatTimer = setInterval(() => {
    for (const client of hubClients) {
      if (!client.isAlive) {
        cleanup(client);
        client.terminate();
        continue;
      }

      client.isAlive = false;
      client.ping((error?: Error) => {
        if (!error) return;
        reportError(error);
        cleanup(client);
        client.terminate();
      });
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  webSocketServer.on('close', () => clearInterval(heartbeatTimer));

  const deliver = (recipientUserIds: readonly number[], payload: unknown): void => {
    const data = JSON.stringify(payload);

    for (const userId of new Set(recipientUserIds)) {
      const userClients = clientsByUserId.get(userId);
      if (!userClients) continue;

      for (const client of userClients) sendSerialized(client, data);
    }
  };

  const broadcast = (payload: unknown): void => {
    const data = JSON.stringify(payload);

    for (const client of hubClients) {
      if (client.authenticated) sendSerialized(client, data);
    }
  };

  return { webSocketServer, deliver, broadcast };
}
