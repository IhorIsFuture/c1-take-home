export function createRelaySocket({
  getAccessToken,
  getConversationIds,
  refreshAccessToken,
  onAuthenticationFailed,
  onMessage,
  onStatus
}) {
  let socket;
  let reconnectTimer;
  let reconnectAttempt = 0;
  let authenticated = false;
  let authenticationFailed = false;
  let authenticationRecoveryAttempted = false;
  let recoveringAuthentication = false;
  let stopped = false;

  function subscribe() {
    if (socket?.readyState !== WebSocket.OPEN || !authenticated) return;

    socket.send(
      JSON.stringify({
        type: 'subscribe',
        conversationIds: getConversationIds()
      })
    );
  }

  function scheduleReconnect() {
    authenticated = false;
    onStatus('offline');

    if (stopped || authenticationFailed) return;

    const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
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
    authenticated = false;
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
        authenticated = true;
        authenticationRecoveryAttempted = false;
        reconnectAttempt = 0;
        onStatus('online');
        subscribe();
        return;
      }

      if (message.type === 'auth_error') {
        authenticationFailed = true;
        authenticated = false;
        onStatus('offline');
        nextSocket.close(1008, 'Authentication failed');
        void recoverAuthentication();
        return;
      }

      if (message.type === 'message') onMessage(message);
    };

    nextSocket.onerror = () => nextSocket.close();
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return;
      socket = undefined;
      scheduleReconnect();
    };
  }

  function close() {
    stopped = true;
    authenticated = false;
    clearTimeout(reconnectTimer);
    socket?.close();
    socket = undefined;
  }

  return { connect, subscribe, close };
}
