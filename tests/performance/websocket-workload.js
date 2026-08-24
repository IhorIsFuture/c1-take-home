import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'k6/timers';
import { WebSocket } from 'k6/websockets';
import { getWebSocketPerformanceProfile } from './websocket-profiles.js';
import { createWebSocketSummaryOutputs } from './websocket-summary.js';

const profileName = __ENV.K6_PROFILE || 'smoke';
const profile = getWebSocketPerformanceProfile(profileName);
const baseUrl = __ENV.K6_BASE_URL || 'http://envoy:3000';
const webSocketUrl = __ENV.K6_WS_BASE_URL || 'ws://envoy:3000/';
const userPassword = __ENV.K6_USER_PASSWORD || 'RelayPerf123!';
const performanceMessageMarker = 'relay-k6-websocket-v1';
const metricTags = { phase: 'measured' };
const authenticationDuration = new Trend('ws_authentication_duration', true);
const authenticationSuccess = new Rate('ws_authentication_success');
const messageCreateDuration = new Trend('ws_message_create_duration', true);
const messageCreateSuccess = new Rate('ws_message_create_success');
const deliveryLatency = new Trend('ws_delivery_latency', true);
const deliverySuccess = new Rate('ws_delivery_success');
const deliveryValid = new Rate('ws_delivery_valid');
const messagesCreated = new Counter('ws_messages_created');
const deliveriesReceived = new Counter('ws_deliveries_received');
const unexpectedDisconnects = new Counter('ws_unexpected_disconnects');
const duplicateDeliveries = new Counter('ws_duplicate_deliveries');
const protocolErrors = new Counter('ws_protocol_errors');

function readPositiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

const firstConversationId = readPositiveInteger(
  __ENV.K6_FIRST_CONVERSATION_ID,
  10000,
  'K6_FIRST_CONVERSATION_ID'
);
const userCount = readPositiveInteger(__ENV.K6_USER_COUNT, 100, 'K6_USER_COUNT');
const conversationCount = readPositiveInteger(
  __ENV.K6_CONVERSATION_COUNT,
  200,
  'K6_CONVERSATION_COUNT'
);

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
  scenarios: profile.scenarios,
  thresholds: profile.thresholds,
  tags: {
    workload: 'websocket',
    profile: profileName
  }
};

function readJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function loginRequests(firstUserOrdinal, count) {
  return Array.from({ length: count }, (_, index) => {
    const userOrdinal = firstUserOrdinal + index;

    return [
      'POST',
      `${baseUrl}/api/auth/login`,
      JSON.stringify({
        email: `performance-user-${userOrdinal}@example.com`,
        password: userPassword
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'text',
        tags: { endpoint: 'ws_setup_login', name: 'POST /api/auth/login', phase: 'setup' }
      }
    ];
  });
}

export function setup() {
  const identityCount = Math.min(profile.connections, userCount, conversationCount + 1);
  const identities = [];
  const loginBatchSize = 10;

  for (let offset = 0; offset < identityCount; offset += loginBatchSize) {
    const requestCount = Math.min(loginBatchSize, identityCount - offset);
    const responses = http.batch(loginRequests(offset + 1, requestCount));

    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      const userOrdinal = offset + index + 1;
      const payload = readJson(response);
      const valid = check(
        response,
        {
          'WebSocket setup login returns 200': current => current.status === 200,
          'WebSocket setup login returns the expected user': () =>
            payload?.user?.email === `performance-user-${userOrdinal}@example.com`,
          'WebSocket setup login returns an access token': () =>
            typeof payload?.accessToken === 'string'
        },
        { phase: 'setup' }
      );

      if (!valid) fail(`WebSocket setup login failed for performance user ${userOrdinal}`);

      identities.push({
        accessToken: payload.accessToken,
        userId: payload.user.id,
        conversationId: firstConversationId + Math.max(0, userOrdinal - 2),
        receivesAllConversations: userOrdinal === 1
      });
    }
  }

  sleep(2);

  return {
    identities,
    runId: __ENV.K6_RUN_ID || 'manual'
  };
}

function parsePerformanceMessage(body) {
  try {
    const payload = JSON.parse(body);

    return payload?.marker === performanceMessageMarker ? payload : null;
  } catch {
    return null;
  }
}

export function webSocketSession(data) {
  const identity = data.identities[(exec.vu.idInTest - 1) % data.identities.length];
  const spreadRatio = (exec.vu.idInTest - 1) / Math.max(profile.connections - 1, 1);

  if (profile.connectionSpreadMs) sleep((profile.connectionSpreadMs * spreadRatio) / 1000);

  const connectionStartedAt = Date.now();
  const pendingDeliveries = new Map();
  const receivedMessageIds = new Set();
  let authenticated = false;
  let authenticationRecorded = false;
  let requestedClose = false;
  let publishTimer;
  let stopPublishingTimer;
  let closeTimer;
  const socket = new WebSocket(webSocketUrl, [], {
    tags: { name: 'Relay realtime WebSocket', phase: 'measured' }
  });

  unexpectedDisconnects.add(0, metricTags);
  duplicateDeliveries.add(0, metricTags);
  protocolErrors.add(0, metricTags);

  const clearTimers = () => {
    if (publishTimer) clearInterval(publishTimer);
    if (stopPublishingTimer) clearTimeout(stopPublishingTimer);
    if (closeTimer) clearTimeout(closeTimer);
    if (authenticationTimer) clearTimeout(authenticationTimer);
  };

  const recordAuthentication = success => {
    if (authenticationRecorded) return;
    authenticationRecorded = true;
    authenticationSuccess.add(success, metricTags);
    authenticationDuration.add(Date.now() - connectionStartedAt, metricTags);
  };

  const createMessage = () => {
    if (!authenticated) return;

    const clientId = createUuid();
    const sentAt = Date.now();
    const body = JSON.stringify({
      marker: performanceMessageMarker,
      runId: data.runId,
      clientId,
      sentAt
    });
    pendingDeliveries.set(clientId, sentAt);
    const response = http.post(
      `${baseUrl}/api/messages`,
      JSON.stringify({ conversationId: identity.conversationId, body, clientId }),
      {
        headers: {
          Authorization: `Bearer ${identity.accessToken}`,
          'Content-Type': 'application/json'
        },
        responseType: 'none',
        tags: {
          endpoint: 'ws_message_create',
          name: 'POST /api/messages',
          phase: 'measured'
        }
      }
    );
    const succeeded = response.status === 201;
    messageCreateDuration.add(response.timings.duration, metricTags);
    messageCreateSuccess.add(succeeded, metricTags);

    check(
      response,
      { 'WebSocket workload message creation returns 201': current => current.status === 201 },
      metricTags
    );

    if (succeeded) {
      messagesCreated.add(1, metricTags);
    } else {
      pendingDeliveries.delete(clientId);
    }
  };

  const authenticationTimer = setTimeout(() => {
    recordAuthentication(false);
    socket.close(1008);
  }, profile.authenticationTimeoutMs);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'authenticate', accessToken: identity.accessToken }));
  });

  socket.addEventListener('message', event => {
    let frame;

    try {
      frame = JSON.parse(event.data);
    } catch {
      protocolErrors.add(1, metricTags);
      return;
    }

    if (frame.type === 'authenticated') {
      authenticated = true;
      recordAuthentication(true);
      if (authenticationTimer) clearTimeout(authenticationTimer);
      createMessage();
      publishTimer = setInterval(createMessage, profile.messageIntervalMs);
      stopPublishingTimer = setTimeout(
        () => clearInterval(publishTimer),
        profile.sessionDurationMs - profile.deliveryDrainMs
      );
      closeTimer = setTimeout(() => {
        requestedClose = true;
        socket.close(1000);
      }, profile.sessionDurationMs);
      return;
    }

    if (frame.type !== 'message') {
      protocolErrors.add(1, metricTags);
      return;
    }

    const message = parsePerformanceMessage(frame.body);
    if (!message || message.runId !== data.runId) return;

    deliveriesReceived.add(1, metricTags);
    deliveryLatency.add(Math.max(0, Date.now() - message.sentAt), metricTags);
    const valid =
      Number.isInteger(frame.id) &&
      frame.id > 0 &&
      Number.isInteger(frame.senderId) &&
      frame.senderId > 0 &&
      typeof frame.senderName === 'string' &&
      frame.senderName.length > 0 &&
      (identity.receivesAllConversations || frame.conversationId === identity.conversationId);
    deliveryValid.add(valid, metricTags);

    if (receivedMessageIds.has(frame.id)) {
      duplicateDeliveries.add(1, metricTags);
    } else {
      receivedMessageIds.add(frame.id);
    }

    if (!pendingDeliveries.has(message.clientId)) return;
    pendingDeliveries.delete(message.clientId);
    const validSenderDelivery = valid && frame.senderId === identity.userId;
    deliverySuccess.add(validSenderDelivery, metricTags);
    check(
      frame,
      { 'created message is delivered to its sender': () => validSenderDelivery },
      metricTags
    );
  });

  socket.addEventListener('close', event => {
    clearTimers();
    if (!authenticated) recordAuthentication(false);

    for (const clientId of pendingDeliveries.keys()) {
      pendingDeliveries.delete(clientId);
      deliverySuccess.add(false, metricTags);
    }

    const closedCleanly = requestedClose && event.code === 1000;
    unexpectedDisconnects.add(closedCleanly ? 0 : 1, metricTags);
    check(event, { 'WebSocket session closes cleanly': () => closedCleanly }, metricTags);
  });
}

export function handleSummary(data) {
  return createWebSocketSummaryOutputs(data, profileName, profile, {
    firstConversationId,
    userCount,
    conversationCount,
    connectionCount: profile.connections,
    identityCount: Math.min(profile.connections, userCount, conversationCount + 1),
    sessionsPerVu: profile.sessionsPerVu,
    sessionDurationMs: profile.sessionDurationMs,
    messageIntervalMs: profile.messageIntervalMs,
    deliveryDrainMs: profile.deliveryDrainMs
  });
}
