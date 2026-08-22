function metricValue(metrics, metricName, valueName) {
  return metrics[metricName]?.values?.[valueName] ?? null;
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

export function createSummaryOutputs(data, profileName, profile) {
  const resultFile = __ENV.K6_RESULT_FILE || '/results/performance-result.json';
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    run: {
      id: __ENV.K6_RUN_ID || 'manual',
      profile: profileName,
      description: profile.description,
      baseUrl: __ENV.K6_BASE_URL,
      gitCommit: __ENV.K6_GIT_COMMIT || 'unknown',
      gitDirty: __ENV.K6_GIT_DIRTY === 'true',
      apiReplicas: Number(__ENV.K6_API_REPLICAS || 1)
    },
    configuration: {
      scenarios: profile.scenarios,
      thresholds: profile.thresholds
    },
    thresholdsPassed: allThresholdsPassed(data.metrics),
    state: data.state,
    metrics: data.metrics
  };
  const lines = [
    '',
    `Relay performance profile: ${profileName}`,
    `Result: ${resultFile}`,
    `Thresholds: ${summary.thresholdsPassed ? 'passed' : 'failed'}`,
    `Requests: ${metricValue(data.metrics, 'http_reqs', 'count') ?? 0}`,
    `Failures: ${formatRate(metricValue(data.metrics, 'http_req_failed', 'rate'))}`,
    `HTTP p95: ${formatMilliseconds(metricValue(data.metrics, 'http_req_duration', 'p(95)'))}`,
    `Dropped iterations: ${metricValue(data.metrics, 'dropped_iterations', 'count') ?? 0}`,
    ''
  ];

  return {
    stdout: lines.join('\n'),
    [resultFile]: JSON.stringify(summary, null, 2)
  };
}
