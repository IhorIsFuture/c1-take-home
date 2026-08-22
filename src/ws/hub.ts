import type { Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { authenticateFrameSchema, subscribeFrameSchema } from './protocol';

const defaultAuthTimeoutMs = 5_000;
const defaultHeartbeatIntervalMs = 30_000;
const defaultMaxPayloadBytes = 16 * 1024;
const defaultMaxSubscriptions = 100;
const defaultMaxBufferedAmountBytes = 1024 * 1024;
const defaultMaxPendingFrames = 32;

export interface WsAuthenticatedUser {
  userId: number;
}

export interface WsHubOptions {
  verifyAccessToken: (accessToken: string) => Promise<WsAuthenticatedUser | null>;
  canAccessConversations: (userId: number, conversationIds: readonly number[]) => Promise<boolean>;
  authTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  maxPayloadBytes?: number;
  maxSubscriptions?: number;
  maxBufferedAmountBytes?: number;
  maxPendingFrames?: number;
  onError?: (error: unknown) => void;
}

type Client = WebSocket & {
  subscriptions: Set<number>;
  userId?: number;
  authenticated: boolean;
  isAlive: boolean;
  authTimer?: ReturnType<typeof setTimeout>;
  messageQueue: Promise<void>;
  pendingFrames: number;
  maxBufferedAmountBytes: number;
  reportError: (error: unknown) => void;
};

const clients = new Set<Client>();

function decodeFrame(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}

function sendJson(client: Client, payload: unknown): boolean {
  if (client.readyState !== WebSocket.OPEN) return false;

  if (client.bufferedAmount > client.maxBufferedAmountBytes) {
    client.terminate();
    return false;
  }

  client.send(JSON.stringify(payload), error => {
    if (!error) return;
    client.reportError(error);
    client.terminate();
  });

  return true;
}

function closeWithError(
  client: Client,
  type: 'auth_error' | 'subscription_error' | 'protocol_error' | 'server_error',
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

async function authenticateClient(
  client: Client,
  frame: unknown,
  verifyAccessToken: WsHubOptions['verifyAccessToken']
): Promise<void> {
  const result = authenticateFrameSchema.safeParse(frame);

  if (!result.success) {
    closeWithError(
      client,
      'auth_error',
      'AUTHENTICATION_REQUIRED',
      'Authentication required',
      1008
    );
    return;
  }

  let authenticatedUser: WsAuthenticatedUser | null;

  try {
    authenticatedUser = await verifyAccessToken(result.data.accessToken);
  } catch (error) {
    client.reportError(error);
    closeWithError(client, 'server_error', 'AUTHENTICATION_UNAVAILABLE', 'Server error', 1011);
    return;
  }

  if (
    !authenticatedUser ||
    !Number.isSafeInteger(authenticatedUser.userId) ||
    authenticatedUser.userId <= 0
  ) {
    closeWithError(client, 'auth_error', 'INVALID_ACCESS_TOKEN', 'Authentication failed', 1008);
    return;
  }

  if (client.readyState !== WebSocket.OPEN) return;

  client.userId = authenticatedUser.userId;
  client.authenticated = true;
  clearAuthenticationTimer(client);
  sendJson(client, { type: 'authenticated' });
}

async function updateSubscriptions(
  client: Client,
  frame: unknown,
  canAccessConversations: WsHubOptions['canAccessConversations'],
  maxSubscriptions: number
): Promise<void> {
  const result = subscribeFrameSchema.safeParse(frame);

  if (!result.success) {
    closeWithError(client, 'protocol_error', 'INVALID_FRAME', 'Invalid frame', 1007);
    return;
  }

  const conversationIds = [...new Set(result.data.conversationIds)];

  if (conversationIds.length > maxSubscriptions) {
    closeWithError(
      client,
      'subscription_error',
      'TOO_MANY_SUBSCRIPTIONS',
      'Too many subscriptions',
      1008
    );
    return;
  }

  if (!client.userId) {
    closeWithError(
      client,
      'auth_error',
      'AUTHENTICATION_REQUIRED',
      'Authentication required',
      1008
    );
    return;
  }

  let authorized: boolean;

  try {
    authorized =
      !conversationIds.length || (await canAccessConversations(client.userId, conversationIds));
  } catch (error) {
    client.reportError(error);
    closeWithError(client, 'server_error', 'AUTHORIZATION_UNAVAILABLE', 'Server error', 1011);
    return;
  }

  if (!authorized) {
    closeWithError(client, 'subscription_error', 'FORBIDDEN', 'Subscription forbidden', 1008);
    return;
  }

  if (client.readyState !== WebSocket.OPEN) return;

  client.subscriptions = new Set(conversationIds);
  sendJson(client, { type: 'subscribed', conversationIds });
}

async function handleFrame(
  client: Client,
  raw: RawData,
  isBinary: boolean,
  options: Required<
    Pick<WsHubOptions, 'verifyAccessToken' | 'canAccessConversations' | 'maxSubscriptions'>
  >
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

  if (!client.authenticated) {
    await authenticateClient(client, frame, options.verifyAccessToken);
    return;
  }

  await updateSubscriptions(
    client,
    frame,
    options.canAccessConversations,
    options.maxSubscriptions
  );
}

export function attachWs(server: Server, options?: WsHubOptions): WebSocketServer {
  const verifyAccessToken = options?.verifyAccessToken ?? (async () => null);
  const canAccessConversations = options?.canAccessConversations ?? (async () => false);
  const authTimeoutMs = options?.authTimeoutMs ?? defaultAuthTimeoutMs;
  const heartbeatIntervalMs = options?.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs;
  const maxPayloadBytes = options?.maxPayloadBytes ?? defaultMaxPayloadBytes;
  const maxSubscriptions = options?.maxSubscriptions ?? defaultMaxSubscriptions;
  const maxBufferedAmountBytes = options?.maxBufferedAmountBytes ?? defaultMaxBufferedAmountBytes;
  const maxPendingFrames = options?.maxPendingFrames ?? defaultMaxPendingFrames;
  const reportError = options?.onError ?? (error => console.error('WebSocket error', error));
  const hubClients = new Set<Client>();
  const wss = new WebSocketServer({
    server,
    maxPayload: maxPayloadBytes,
    perMessageDeflate: false
  });

  const cleanup = (client: Client): void => {
    clearAuthenticationTimer(client);
    client.subscriptions.clear();
    hubClients.delete(client);
    clients.delete(client);
  };

  wss.on('connection', (socket: WebSocket) => {
    const client = socket as Client;
    client.subscriptions = new Set();
    client.authenticated = false;
    client.isAlive = true;
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
    clients.add(client);

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
          await handleFrame(client, raw, isBinary, {
            verifyAccessToken,
            canAccessConversations,
            maxSubscriptions
          });
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

  wss.on('close', () => clearInterval(heartbeatTimer));

  return wss;
}

export function broadcast(conversationId: number, payload: unknown): void {
  const data = JSON.stringify(payload);

  for (const client of clients) {
    if (!client.authenticated || !client.subscriptions.has(conversationId)) continue;
    if (client.readyState !== WebSocket.OPEN) continue;

    if (client.bufferedAmount > client.maxBufferedAmountBytes) {
      client.terminate();
      continue;
    }

    client.send(data, error => {
      if (!error) return;
      client.reportError(error);
      client.terminate();
    });
  }
}
