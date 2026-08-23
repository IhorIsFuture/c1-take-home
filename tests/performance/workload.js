import { check, fail } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { getPerformanceProfile } from './profiles.js';
import { createSummaryOutputs } from './summary.js';

const profileName = __ENV.K6_PROFILE || 'smoke';
const profile = getPerformanceProfile(profileName);
const baseUrl = __ENV.K6_BASE_URL || 'http://envoy:3000';
const userEmail = __ENV.K6_USER_EMAIL || 'performance-user-1@example.com';
const userPassword = __ENV.K6_USER_PASSWORD || 'RelayPerf123!';
const validateResponseBodies = profileName === 'smoke' || profileName === 'warmup';

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
const messagesPerConversation = readPositiveInteger(
  __ENV.K6_MESSAGES_PER_CONVERSATION,
  50,
  'K6_MESSAGES_PER_CONVERSATION'
);
const writeConversationCount =
  conversationCount === 1 ? 1 : Math.max(1, Math.floor(conversationCount * 0.1));
const readConversationCount = Math.max(1, conversationCount - writeConversationCount);
const firstWriteConversationId = firstConversationId + conversationCount - writeConversationCount;
const dataset = {
  firstConversationId,
  userCount,
  conversationCount,
  messagesPerConversation,
  readConversationCount,
  writeConversationCount
};

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
  scenarios: profile.scenarios,
  thresholds: profile.thresholds,
  tags: {
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

function requestParameters(accessToken, endpoint, name, contentType = false) {
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(contentType ? { 'Content-Type': 'application/json' } : {})
    },
    responseType: validateResponseBodies ? 'text' : 'none',
    tags: {
      endpoint,
      name
    }
  };
}

function selectConversationId(firstId, count) {
  return firstId + (exec.scenario.iterationInTest % count);
}

function selectReadConversationId() {
  return selectConversationId(firstConversationId, readConversationCount);
}

function selectWriteConversationId() {
  return selectConversationId(firstWriteConversationId, writeConversationCount);
}

function selectSearchQuery() {
  const queries = ['Performance User', 'Performance User 1', 'performance-user-2', 'example.com'];

  return queries[exec.scenario.iterationInTest % queries.length];
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function setup() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email: userEmail, password: userPassword }),
    {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'text',
      tags: { endpoint: 'setup_login', name: 'POST /api/auth/login', phase: 'setup' }
    }
  );
  const payload = readJson(response);
  const valid = check(response, {
    'setup login returns 200': current => current.status === 200,
    'setup login returns an access token': () => typeof payload?.accessToken === 'string'
  });

  if (!valid) fail(`Performance setup login failed with HTTP ${response.status}`);

  return { accessToken: payload.accessToken };
}

export function listConversations(data) {
  const response = http.get(
    `${baseUrl}/api/conversations`,
    requestParameters(data.accessToken, 'conversation_list', 'GET /api/conversations')
  );
  const payload = validateResponseBodies ? readJson(response) : null;

  check(response, {
    'conversation list returns 200': current => current.status === 200,
    ...(validateResponseBodies
      ? {
          'conversation list returns the seeded dataset': () =>
            Array.isArray(payload) && payload.length === conversationCount
        }
      : {})
  });
}

export function listMessages(data) {
  const conversationId = selectReadConversationId();
  const response = http.get(
    `${baseUrl}/api/messages?conversationId=${conversationId}`,
    requestParameters(data.accessToken, 'message_list', 'GET /api/messages')
  );
  const payload = validateResponseBodies ? readJson(response) : null;

  check(response, {
    'message list returns 200': current => current.status === 200,
    ...(validateResponseBodies
      ? {
          'message list returns seeded messages': () =>
            Array.isArray(payload) && payload.length === messagesPerConversation
        }
      : {})
  });
}

export function searchUsers(data) {
  const query = selectSearchQuery();
  const response = http.get(
    `${baseUrl}/api/users?query=${encodeURIComponent(query)}&limit=20`,
    requestParameters(data.accessToken, 'user_search', 'GET /api/users')
  );
  const payload = validateResponseBodies ? readJson(response) : null;

  check(response, {
    'user search returns 200': current => current.status === 200,
    ...(validateResponseBodies
      ? {
          'user search returns users': () =>
            Array.isArray(payload) && payload.length > 0 && payload.length <= 20
        }
      : {})
  });
}

export function createMessage(data) {
  const conversationId = selectWriteConversationId();
  const clientId = createUuid();
  const body = `Performance run ${__ENV.K6_RUN_ID || 'manual'} message ${clientId}`;
  const response = http.post(
    `${baseUrl}/api/messages`,
    JSON.stringify({ conversationId, body, clientId }),
    requestParameters(data.accessToken, 'message_create', 'POST /api/messages', true)
  );
  const payload = validateResponseBodies ? readJson(response) : null;

  check(response, {
    'message creation returns 201': current => current.status === 201,
    ...(validateResponseBodies
      ? {
          'message creation returns the stored body': () =>
            payload?.conversationId === conversationId && payload?.body === body
        }
      : {})
  });
}

export function handleSummary(data) {
  return createSummaryOutputs(data, profileName, profile, dataset);
}
