export class ApiError extends Error {
  constructor(message, status, retryAfter = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);

  if (options.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || null;
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      retryAfter
    );
  }

  return payload;
}

export function getConversations(userId, signal) {
  return request(`/api/conversations?userId=${encodeURIComponent(userId)}`, { signal });
}

export function createConversation(title, participantIds) {
  return request('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, participantIds })
  });
}

export function getMessages(conversationId, signal) {
  return request(`/api/messages?conversationId=${encodeURIComponent(conversationId)}`, { signal });
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
