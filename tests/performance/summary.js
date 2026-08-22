function taggedMetric(metric, phase) {
  return `${metric}{phase:${phase}}`;
}

function metricValue(metrics, metricName, valueName) {
  return metrics[metricName]?.values?.[valueName] ?? null;
}

function scopedMetricValue(metrics, metricName, phase, valueName) {
  return metricValue(metrics, taggedMetric(metricName, phase), valueName);
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

export function createSummaryOutputs(data, profileName, profile, dataset) {
  const resultFile = __ENV.K6_RESULT_FILE || '/results/performance-result.json';
  const phase = profile.metricPhase;
  const persistResult = profile.persistResult !== false;
  const summary = {
    schemaVersion: 2,
    methodologyVersion: 2,
    generatedAt: new Date().toISOString(),
    run: {
      id: __ENV.K6_RUN_ID || 'manual',
      profile: profileName,
      description: profile.description,
      baseUrl: __ENV.K6_BASE_URL,
      gitCommit: __ENV.K6_GIT_COMMIT || 'unknown',
      gitDirty: __ENV.K6_GIT_DIRTY === 'true',
      apiReplicas: Number(__ENV.K6_API_REPLICAS || 1),
      k6Version: __ENV.K6_ENGINE_VERSION || 'unknown'
    },
    configuration: {
      metricsScope: { phase },
      preconditioning: profile.preconditioning ?? null,
      dataset,
      scenarios: profile.scenarios,
      thresholds: profile.thresholds
    },
    thresholdsPassed: allThresholdsPassed(data.metrics),
    state: data.state,
    metrics: data.metrics
  };
  const droppedIterations =
    scopedMetricValue(data.metrics, 'dropped_iterations', phase, 'count') ??
    metricValue(data.metrics, 'dropped_iterations', 'count') ??
    0;
  const lines = [
    '',
    `Relay performance profile: ${profileName}`,
    `Metric phase: ${phase}`,
    `Result: ${persistResult ? resultFile : 'not persisted'}`,
    `Thresholds: ${summary.thresholdsPassed ? 'passed' : 'failed'}`,
    `Requests: ${scopedMetricValue(data.metrics, 'http_reqs', phase, 'count') ?? 0}`,
    `Request rate: ${scopedMetricValue(data.metrics, 'http_reqs', phase, 'rate')?.toFixed(2) ?? 'n/a'}/s`,
    `Failures: ${formatRate(scopedMetricValue(data.metrics, 'http_req_failed', phase, 'rate'))}`,
    `HTTP p95: ${formatMilliseconds(scopedMetricValue(data.metrics, 'http_req_duration', phase, 'p(95)'))}`,
    `HTTP p99: ${formatMilliseconds(scopedMetricValue(data.metrics, 'http_req_duration', phase, 'p(99)'))}`,
    `Dropped iterations: ${droppedIterations}`,
    ''
  ];
  const outputs = { stdout: lines.join('\n') };

  if (persistResult) outputs[resultFile] = JSON.stringify(summary, null, 2);

  return outputs;
}
