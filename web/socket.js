export function createRelaySocket({
  getAccessToken,
  refreshAccessToken,
  onAuthenticationFailed,
  onMessage,
  onTyping,
  onConversationCreated,
  onResyncRequired,
  onStatus
}) {
  let socket;
  let reconnectTimer;
  let reconnectAttempt = 0;
  let authenticationFailed = false;
  let authenticationRecoveryAttempted = false;
  let recoveringAuthentication = false;
  let hasAuthenticated = false;
  let authenticatedNow = false;
  let stopped = false;

  function scheduleReconnect() {
    onStatus('offline');

    if (stopped || authenticationFailed) return;

    const maximumDelay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
    const delay = maximumDelay / 2 + Math.random() * (maximumDelay / 2);
    reconnectAttempt += 1;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  }

  async function recoverAuthentication() {
    if (stopped || recoveringAuthentication) return;

    if (authenticationRecoveryAttempted || !refreshAccessToken) {
      onAuthenticationFailed?.();
      return;
    }

    authenticationRecoveryAttempted = true;
    recoveringAuthentication = true;

    try {
      await refreshAccessToken();
      if (stopped) return;
      authenticationFailed = false;
      connect();
    } catch {
      onAuthenticationFailed?.();
    } finally {
      recoveringAuthentication = false;
    }
  }

  function connect() {
    if (stopped || socket?.readyState === WebSocket.CONNECTING) return;
    if (socket?.readyState === WebSocket.OPEN) return;

    const accessToken = getAccessToken?.();

    if (!accessToken) {
      onStatus('offline');
      return;
    }

    authenticationFailed = false;
    onStatus('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const nextSocket = new WebSocket(`${protocol}//${location.host}/`);
    socket = nextSocket;

    nextSocket.onopen = () => {
      nextSocket.send(JSON.stringify({ type: 'authenticate', accessToken }));
    };

    nextSocket.onmessage = event => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'authenticated') {
        const reconnected = hasAuthenticated;
        hasAuthenticated = true;
        authenticatedNow = true;
        authenticationRecoveryAttempted = false;
        reconnectAttempt = 0;
        onStatus('online');
        if (reconnected) onResyncRequired?.();
        return;
      }

      if (message.type === 'realtime_unavailable') {
        onStatus('offline');
        return;
      }

      if (message.type === 'resync_required') {
        onStatus('online');
        onResyncRequired?.();
        return;
      }

      if (message.type === 'auth_error') {
        authenticationFailed = true;
        onStatus('offline');
        nextSocket.close(4000, 'Authentication failed');
        void recoverAuthentication();
        return;
      }

      if (message.type === 'typing') {
        onTyping?.(message);
        return;
      }

      if (message.type === 'conversation_created') {
        onConversationCreated?.(message);
        return;
      }

      if (message.type === 'message') onMessage(message);
    };

    nextSocket.onerror = () => nextSocket.close();
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return;
      socket = undefined;
      authenticatedNow = false;
      scheduleReconnect();
    };
  }

  function sendTyping(conversationId) {
    if (!authenticatedNow || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'typing', conversationId }));
  }

  function close() {
    stopped = true;
    authenticatedNow = false;
    clearTimeout(reconnectTimer);
    socket?.close();
    socket = undefined;
  }

  return { connect, close, sendTyping };
}
