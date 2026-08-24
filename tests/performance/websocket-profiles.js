function taggedMetric(metric, phase = 'measured') {
  return `${metric}{phase:${phase}}`;
}

function sessionScenario(profile) {
  const maximumDurationMs =
    profile.sessionsPerVu * (profile.sessionDurationMs + profile.connectionSpreadMs) + 15000;

  return {
    executor: 'per-vu-iterations',
    exec: 'webSocketSession',
    vus: profile.connections,
    iterations: profile.sessionsPerVu,
    maxDuration: `${Math.ceil(maximumDurationMs / 1000)}s`,
    tags: { phase: 'measured' }
  };
}

function thresholds({ connecting, authentication, delivery, messageCreate }) {
  return {
    [taggedMetric('checks')]: ['rate>0.999'],
    [taggedMetric('ws_sessions')]: ['count>0'],
    [taggedMetric('ws_connecting')]: [`p(95)<${connecting}`],
    [taggedMetric('ws_authentication_duration')]: [`p(95)<${authentication}`],
    [taggedMetric('ws_authentication_success')]: ['rate>0.999'],
    [taggedMetric('ws_message_create_duration')]: [`p(95)<${messageCreate}`],
    [taggedMetric('ws_message_create_success')]: ['rate>0.999'],
    [taggedMetric('ws_delivery_latency')]: [`p(95)<${delivery}`],
    [taggedMetric('ws_delivery_success')]: ['rate>0.999'],
    [taggedMetric('ws_delivery_valid')]: ['rate==1'],
    [taggedMetric('ws_unexpected_disconnects')]: ['count==0'],
    [taggedMetric('ws_duplicate_deliveries')]: ['count==0'],
    [taggedMetric('ws_protocol_errors')]: ['count==0']
  };
}

function createProfile(configuration) {
  return {
    ...configuration,
    workload: 'websocket',
    metricPhase: 'measured',
    scenarios: {
      websocket_sessions: sessionScenario(configuration)
    },
    thresholds: thresholds(configuration.thresholdLatencyMs)
  };
}

export const websocketPerformanceProfiles = {
  smoke: createProfile({
    description: 'Correctness check with clean reconnects through Envoy and two API instances',
    connections: 2,
    sessionsPerVu: 2,
    sessionDurationMs: 8000,
    connectionSpreadMs: 0,
    messageIntervalMs: 3000,
    deliveryDrainMs: 2000,
    authenticationTimeoutMs: 5000,
    thresholdLatencyMs: {
      connecting: 5000,
      authentication: 5000,
      delivery: 5000,
      messageCreate: 5000
    }
  }),
  baseline: createProfile({
    description: 'Stable WebSocket baseline with 25 concurrent authenticated clients',
    connections: 25,
    sessionsPerVu: 1,
    sessionDurationMs: 60000,
    connectionSpreadMs: 2000,
    messageIntervalMs: 5000,
    deliveryDrainMs: 5000,
    authenticationTimeoutMs: 5000,
    thresholdLatencyMs: {
      connecting: 1000,
      authentication: 1000,
      delivery: 1500,
      messageCreate: 1500
    }
  }),
  load: createProfile({
    description: 'Expected realtime load with 100 concurrent authenticated clients',
    connections: 100,
    sessionsPerVu: 1,
    sessionDurationMs: 60000,
    connectionSpreadMs: 5000,
    messageIntervalMs: 3000,
    deliveryDrainMs: 5000,
    authenticationTimeoutMs: 5000,
    thresholdLatencyMs: {
      connecting: 2000,
      authentication: 2000,
      delivery: 2500,
      messageCreate: 2500
    }
  })
};

export function getWebSocketPerformanceProfile(name) {
  const profile = websocketPerformanceProfiles[name];

  if (!profile) throw new Error(`Unknown WebSocket performance profile: ${name}`);

  return profile;
}
