export function createRelaySocket({ getConversationIds, onMessage, onStatus }) {
  let socket;
  let reconnectTimer;
  let reconnectAttempt = 0;
  let stopped = false;

  function subscribe() {
    if (socket?.readyState !== WebSocket.OPEN) return;

    socket.send(
      JSON.stringify({
        type: 'subscribe',
        conversationIds: getConversationIds()
      })
    );
  }

  function scheduleReconnect() {
    if (stopped) return;

    const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
    reconnectAttempt += 1;
    onStatus('offline');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    if (stopped) return;

    onStatus('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/`);

    socket.onopen = () => {
      reconnectAttempt = 0;
      onStatus('online');
      subscribe();
    };

    socket.onmessage = event => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'message') onMessage(message);
    };

    socket.onerror = () => socket.close();
    socket.onclose = scheduleReconnect;
  }

  function close() {
    stopped = true;
    clearTimeout(reconnectTimer);
    socket?.close();
  }

  return { connect, subscribe, close };
}
