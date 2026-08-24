function taggedMetric(metric, phase) {
  return `${metric}{phase:${phase}}`;
}

function metricValue(metrics, metricName, valueName) {
  return metrics[metricName]?.values?.[valueName] ?? null;
}

function scopedMetricValue(metrics, metricName, phase, valueName) {
  return (
    metricValue(metrics, taggedMetric(metricName, phase), valueName) ??
    metricValue(metrics, metricName, valueName)
  );
}

function allThresholdsPassed(metrics) {
  return Object.values(metrics).every(metric =>
    Object.values(metric.thresholds ?? {}).every(threshold => threshold.ok)
  );
}

function formatMilliseconds(value) {
  return value === null ? 'n/a' : `${value.toFixed(2)}ms`;
}

function formatRate(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

export function createWebSocketSummaryOutputs(data, profileName, profile, dataset) {
  const resultFile = __ENV.K6_RESULT_FILE || '/results/websocket-performance-result.json';
  const phase = profile.metricPhase;
  const summary = {
    schemaVersion: 3,
    methodologyVersion: 1,
    generatedAt: new Date().toISOString(),
    run: {
      id: __ENV.K6_RUN_ID || 'manual',
      workload: 'websocket',
      profile: `websocket-${profileName}`,
      description: profile.description,
      baseUrl: __ENV.K6_WS_BASE_URL,
      gitCommit: __ENV.K6_GIT_COMMIT || 'unknown',
      gitDirty: __ENV.K6_GIT_DIRTY === 'true',
      apiReplicas: Number(__ENV.K6_API_REPLICAS || 1),
      k6Version: __ENV.K6_ENGINE_VERSION || 'unknown'
    },
    configuration: {
      metricsScope: { phase },
      preconditioning: null,
      dataset,
      scenarios: profile.scenarios,
      thresholds: profile.thresholds
    },
    thresholdsPassed: allThresholdsPassed(data.metrics),
    state: data.state,
    metrics: data.metrics
  };
  const lines = [
    '',
    `Relay WebSocket performance profile: ${profileName}`,
    `Result: ${resultFile}`,
    `Thresholds: ${summary.thresholdsPassed ? 'passed' : 'failed'}`,
    `Sessions: ${scopedMetricValue(data.metrics, 'ws_sessions', phase, 'count') ?? 0}`,
    `Connection p95: ${formatMilliseconds(scopedMetricValue(data.metrics, 'ws_connecting', phase, 'p(95)'))}`,
    `Authentication p95: ${formatMilliseconds(scopedMetricValue(data.metrics, 'ws_authentication_duration', phase, 'p(95)'))}`,
    `Message create p95: ${formatMilliseconds(scopedMetricValue(data.metrics, 'ws_message_create_duration', phase, 'p(95)'))}`,
    `Delivery median: ${formatMilliseconds(scopedMetricValue(data.metrics, 'ws_delivery_latency', phase, 'med'))}`,
    `Delivery p95: ${formatMilliseconds(scopedMetricValue(data.metrics, 'ws_delivery_latency', phase, 'p(95)'))}`,
    `Delivery success: ${formatRate(scopedMetricValue(data.metrics, 'ws_delivery_success', phase, 'rate'))}`,
    `Messages created: ${scopedMetricValue(data.metrics, 'ws_messages_created', phase, 'count') ?? 0}`,
    `Deliveries received: ${scopedMetricValue(data.metrics, 'ws_deliveries_received', phase, 'count') ?? 0}`,
    `Unexpected disconnects: ${scopedMetricValue(data.metrics, 'ws_unexpected_disconnects', phase, 'count') ?? 0}`,
    `Duplicate deliveries: ${scopedMetricValue(data.metrics, 'ws_duplicate_deliveries', phase, 'count') ?? 0}`,
    ''
  ];

  return {
    stdout: lines.join('\n'),
    [resultFile]: JSON.stringify(summary, null, 2)
  };
}
