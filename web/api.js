export class ApiError extends Error {
  constructor(message, status, retryAfter = null, code = null, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let refreshPromise = null;
let sessionExpiredHandler = null;

async function readPayload(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function rawRequest(path, options = {}, token = null) {
  const headers = new Headers(options.headers);

  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || null;
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      retryAfter,
      payload?.code ?? null,
      payload?.details ?? null
    );
  }

  return payload;
}

function rememberSession(session) {
  accessToken = session?.accessToken ?? null;
  return session;
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/api/auth/refresh', { method: 'POST' })
      .then(rememberSession)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function request(path, options = {}) {
  const { retryAuthentication = true, ...fetchOptions } = options;

  try {
    return await rawRequest(path, fetchOptions, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !retryAuthentication) throw error;

    try {
      await refreshAccessToken();
    } catch (refreshError) {
      accessToken = null;
      sessionExpiredHandler?.();
      throw refreshError instanceof ApiError ? refreshError : error;
    }

    try {
      return await rawRequest(path, fetchOptions, accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        accessToken = null;
        sessionExpiredHandler?.();
      }
      throw retryError;
    }
  }
}

export function getAccessToken() {
  return accessToken;
}

export function onSessionExpired(handler) {
  sessionExpiredHandler = handler;
}

export function registerAccount(account) {
  return rawRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(account)
  }).then(rememberSession);
}

export function loginAccount(credentials) {
  return rawRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  }).then(rememberSession);
}

export async function restoreSession() {
  try {
    return await refreshAccessToken();
  } catch (error) {
    accessToken = null;
    throw error;
  }
}

export async function logoutAccount() {
  try {
    await rawRequest('/api/auth/logout', { method: 'POST' }, accessToken);
  } finally {
    accessToken = null;
  }
}

export function getCurrentUser(signal) {
  return request('/api/users/me', { signal });
}

export function searchUsers(query, signal) {
  const search = new URLSearchParams({ query, limit: '20' });
  return request(`/api/users?${search}`, { signal });
}

export function getConversations(signal) {
  return request('/api/conversations', { signal });
}

export function createConversation(title, participantIds, clientId) {
  return request('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, participantIds, clientId })
  });
}

export function getMessages(conversationId, { beforeId, limit = 30 } = {}, signal) {
  const search = new URLSearchParams({ limit: String(limit) });
  if (beforeId) search.set('beforeId', String(beforeId));
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages?${search}`, {
    signal
  });
}

export function markConversationRead(conversationId, throughMessageId) {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
    body: JSON.stringify({ throughMessageId })
  });
}

export function createMessage(message) {
  return request('/api/messages', {
    method: 'POST',
    body: JSON.stringify(message)
  });
}

export function searchMessages(query, signal) {
  return request(`/api/search?q=${encodeURIComponent(query)}`, { signal });
}
