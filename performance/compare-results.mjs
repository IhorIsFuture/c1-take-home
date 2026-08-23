import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, isDeepStrictEqual } from 'node:util';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDirectory = resolve(projectDirectory, 'performance', 'results');
const endpointNames = ['conversation_list', 'message_list', 'user_search', 'message_create'];
const websocketLatencyMetrics = [
  ['connection', 'ws_connecting'],
  ['authentication', 'ws_authentication_duration'],
  ['message_create', 'ws_message_create_duration'],
  ['delivery', 'ws_delivery_latency']
];
const profileNames = new Set([
  'smoke',
  'baseline',
  'load',
  'stress',
  'websocket-smoke',
  'websocket-baseline',
  'websocket-load'
]);
const supportedSchemaVersions = new Set([1, 2, 3]);
const arguments_ = process.argv.slice(2);
const forceColor = process.env.FORCE_COLOR;
const colorsEnabled =
  forceColor === '0'
    ? false
    : forceColor !== undefined || (process.env.NO_COLOR === undefined && !!process.stdout.isTTY);
const colors = {
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  orange: '\u001b[38;5;208m',
  red: '\u001b[31m',
  neutral: '\u001b[90m',
  reset: '\u001b[39m'
};
const latencyColorThresholds = {
  minimum: { percentage: 10, deltaMs: 2 },
  orange: { percentage: 25, deltaMs: 5 },
  red: { percentage: 50, deltaMs: 10 }
};

function displayPath(filePath) {
  const relativePath = relative(projectDirectory, filePath);
  return relativePath.startsWith('..') ? filePath : relativePath;
}

function validateResult(result, filePath) {
  if (!supportedSchemaVersions.has(result?.schemaVersion)) {
    throw new Error(`unsupported schema version ${result?.schemaVersion ?? 'missing'}`);
  }

  if (!Number.isFinite(Date.parse(result.generatedAt))) {
    throw new Error('generatedAt must be a valid timestamp');
  }

  if (!result.run || typeof result.run.profile !== 'string') {
    throw new Error('run.profile is missing');
  }

  if (!Number.isInteger(result.run.apiReplicas) || result.run.apiReplicas < 1) {
    throw new Error('run.apiReplicas must be a positive integer');
  }

  if (!result.configuration || typeof result.configuration.scenarios !== 'object') {
    throw new Error('configuration.scenarios is missing');
  }

  if (!result.metrics || typeof result.metrics !== 'object') {
    throw new Error('metrics are missing');
  }

  return {
    filePath,
    displayPath: displayPath(filePath),
    generatedAtMs: Date.parse(result.generatedAt),
    result
  };
}

async function readResult(filePath) {
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(projectDirectory, filePath);

  try {
    const result = JSON.parse(await readFile(resolvedPath, 'utf8'));
    return validateResult(result, resolvedPath);
  } catch (error) {
    throw new Error(`${displayPath(resolvedPath)} is not a valid Relay performance result`, {
      cause: error
    });
  }
}

function methodologyVersion(result) {
  return result.methodologyVersion ?? result.schemaVersion;
}

function workload(result) {
  return result.run.workload ?? 'http';
}

function comparabilityDifferences(before, after) {
  const differences = [];

  if (methodologyVersion(before) !== methodologyVersion(after)) {
    differences.push('methodology version');
  }

  if (workload(before) !== workload(after)) differences.push('workload');
  if (before.run.profile !== after.run.profile) differences.push('profile');
  if (before.run.apiReplicas !== after.run.apiReplicas) differences.push('API replica count');
  if (before.run.baseUrl !== after.run.baseUrl) differences.push('base URL');

  if (!isDeepStrictEqual(before.configuration.scenarios, after.configuration.scenarios)) {
    differences.push('scenario configuration');
  }

  if (
    !isDeepStrictEqual(
      before.configuration.preconditioning ?? null,
      after.configuration.preconditioning ?? null
    )
  ) {
    differences.push('preconditioning configuration');
  }

  if (
    !isDeepStrictEqual(before.configuration.dataset ?? null, after.configuration.dataset ?? null)
  ) {
    differences.push('dataset configuration');
  }

  if (
    !isDeepStrictEqual(
      before.configuration.metricsScope ?? null,
      after.configuration.metricsScope ?? null
    )
  ) {
    differences.push('metrics scope');
  }

  if ((before.run.k6Version ?? null) !== (after.run.k6Version ?? null)) {
    differences.push('k6 version');
  }

  return differences;
}

function assertComparable(before, after) {
  const differences = comparabilityDifferences(before, after);

  if (differences.length) {
    throw new Error(`Performance results differ by ${differences.join(', ')}`);
  }
}

async function discoverResults() {
  const entries = await readdir(resultsDirectory, { withFileTypes: true });
  const candidates = [];
  const warnings = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const filePath = resolve(resultsDirectory, entry.name);

    try {
      candidates.push(await readResult(filePath));
    } catch (error) {
      warnings.push(`${displayPath(filePath)} skipped: ${error.cause?.message ?? error.message}`);
    }
  }

  candidates.sort(
    (left, right) =>
      left.generatedAtMs - right.generatedAtMs || left.filePath.localeCompare(right.filePath)
  );

  return { candidates, warnings };
}

function findPreviousComparable(candidates, after) {
  return candidates
    .filter(
      candidate =>
        candidate.filePath !== after.filePath && candidate.generatedAtMs < after.generatedAtMs
    )
    .reverse()
    .find(candidate => !comparabilityDifferences(candidate.result, after.result).length);
}

async function selectResults() {
  if (arguments_.length > 2) {
    throw new Error(
      'Usage: npm run perf:compare -- [profile | after-result.json | before-result.json after-result.json]'
    );
  }

  if (arguments_.length === 2) {
    const before = await readResult(arguments_[0]);
    const after = await readResult(arguments_[1]);
    assertComparable(before.result, after.result);

    if (before.generatedAtMs >= after.generatedAtMs) {
      throw new Error('The before result must be older than the after result');
    }

    return { before, after, mode: 'explicit', warnings: [] };
  }

  const { candidates, warnings } = await discoverResults();

  if (!candidates.length) throw new Error('No valid performance results were found');

  let after;

  if (!arguments_.length) {
    after = candidates.at(-1);
  } else if (profileNames.has(arguments_[0])) {
    after = candidates.filter(candidate => candidate.result.run.profile === arguments_[0]).at(-1);

    if (!after) throw new Error(`No performance results found for profile ${arguments_[0]}`);
  } else {
    after = await readResult(arguments_[0]);
  }

  const before = findPreviousComparable(candidates, after);

  if (!before) {
    throw new Error(`No older comparable result found for ${after.displayPath}`);
  }

  return {
    before,
    after,
    mode: arguments_.length ? 'automatic before' : 'automatic pair',
    warnings
  };
}

function metricCandidates(result, metricName, endpoint) {
  const phase = result.configuration.metricsScope?.phase;

  if (!phase) {
    return [endpoint ? `${metricName}{endpoint:${endpoint}}` : metricName];
  }

  if (!endpoint) return [`${metricName}{phase:${phase}}`];

  return [
    `${metricName}{endpoint:${endpoint},phase:${phase}}`,
    `${metricName}{phase:${phase},endpoint:${endpoint}}`
  ];
}

function readMetricValue(result, metricName, valueName, endpoint) {
  for (const candidate of metricCandidates(result, metricName, endpoint)) {
    const value = result.metrics[candidate]?.values?.[valueName];
    if (typeof value === 'number') return value;
  }

  return null;
}

function readDroppedIterations(result) {
  return (
    readMetricValue(result, 'dropped_iterations', 'count') ??
    result.metrics.dropped_iterations?.values?.count ??
    0
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function roundedOrNull(value) {
  return value === null ? null : round(value);
}

function colorize(value, color) {
  if (!colorsEnabled) return value;

  return {
    [inspect.custom]() {
      return `${colors[color]}${value}${colors.reset}`;
    }
  };
}

function formatLatencyChange(beforeValue, afterValue) {
  if (beforeValue === null || afterValue === null) return null;
  if (!beforeValue) return colorize(afterValue ? 'n/a' : 'unchanged', 'neutral');

  const improvement = ((beforeValue - afterValue) / beforeValue) * 100;
  if (Math.abs(improvement) < 0.005) return colorize('unchanged', 'neutral');

  const absoluteChange = Math.abs(improvement);
  const formattedChange = `${round(absoluteChange)}%`;

  if (improvement > 0) return colorize(`${formattedChange} faster`, 'green');

  const absoluteDeltaMs = afterValue - beforeValue;
  const formattedSlowdown = `${formattedChange} slower`;

  if (
    absoluteChange < latencyColorThresholds.minimum.percentage ||
    absoluteDeltaMs < latencyColorThresholds.minimum.deltaMs
  ) {
    return colorize(formattedSlowdown, 'neutral');
  }
  if (
    absoluteChange >= latencyColorThresholds.red.percentage &&
    absoluteDeltaMs >= latencyColorThresholds.red.deltaMs
  ) {
    return colorize(formattedSlowdown, 'red');
  }
  if (
    absoluteChange >= latencyColorThresholds.orange.percentage &&
    absoluteDeltaMs >= latencyColorThresholds.orange.deltaMs
  ) {
    return colorize(formattedSlowdown, 'orange');
  }

  return colorize(formattedSlowdown, 'yellow');
}

function latencyRow(label, before, after, metricName, endpoint) {
  const beforeMedian = readMetricValue(before, metricName, 'med', endpoint);
  const afterMedian = readMetricValue(after, metricName, 'med', endpoint);
  const beforeP95 = readMetricValue(before, metricName, 'p(95)', endpoint);
  const afterP95 = readMetricValue(after, metricName, 'p(95)', endpoint);

  return {
    metric: label,
    'before median ms': roundedOrNull(beforeMedian),
    'after median ms': roundedOrNull(afterMedian),
    'median change': formatLatencyChange(beforeMedian, afterMedian),
    'delta median ms':
      beforeMedian === null || afterMedian === null ? null : round(afterMedian - beforeMedian),
    'before p95 ms': roundedOrNull(beforeP95),
    'after p95 ms': roundedOrNull(afterP95),
    'p95 change': formatLatencyChange(beforeP95, afterP95),
    'delta p95 ms': beforeP95 === null || afterP95 === null ? null : round(afterP95 - beforeP95),
    'before samples': readMetricValue(before, metricName, 'count', endpoint),
    'after samples': readMetricValue(after, metricName, 'count', endpoint)
  };
}

function percentage(value) {
  return value === null ? null : `${round(value * 100)}%`;
}

function httpRunRow(label, file) {
  const result = file.result;

  return {
    run: label,
    generated: result.generatedAt,
    commit: `${result.run.gitCommit ?? 'unknown'}${result.run.gitDirty ? ' dirty' : ''}`,
    thresholds: result.thresholdsPassed ? 'passed' : 'failed',
    requests: readMetricValue(result, 'http_reqs', 'count'),
    'requests/s': roundedOrNull(readMetricValue(result, 'http_reqs', 'rate')),
    failures: percentage(readMetricValue(result, 'http_req_failed', 'rate')),
    dropped: readDroppedIterations(result)
  };
}

function overallMetricValue(result, metricName, valueName) {
  return result.metrics[metricName]?.values?.[valueName] ?? null;
}

function websocketRunRow(label, file) {
  const result = file.result;

  return {
    run: label,
    generated: result.generatedAt,
    commit: `${result.run.gitCommit ?? 'unknown'}${result.run.gitDirty ? ' dirty' : ''}`,
    thresholds: result.thresholdsPassed ? 'passed' : 'failed',
    sessions: readMetricValue(result, 'ws_sessions', 'count'),
    created: overallMetricValue(result, 'ws_messages_created', 'count'),
    deliveries: overallMetricValue(result, 'ws_deliveries_received', 'count'),
    'delivery success': percentage(readMetricValue(result, 'ws_delivery_success', 'rate')),
    disconnects: readMetricValue(result, 'ws_unexpected_disconnects', 'count'),
    duplicates: readMetricValue(result, 'ws_duplicate_deliveries', 'count')
  };
}

function reliabilityWarnings(before, after, latencyRows) {
  const warnings = [];
  const resultWorkload = workload(before);

  for (const [label, result] of [
    ['before', before],
    ['after', after]
  ]) {
    if (result.run.gitDirty) warnings.push(`${label} run used a dirty git worktree`);
    if (!result.thresholdsPassed) warnings.push(`${label} run failed one or more thresholds`);

    if (resultWorkload === 'http') {
      const failures = readMetricValue(result, 'http_req_failed', 'rate');
      if (failures) warnings.push(`${label} run contains failed HTTP requests`);
      if (readDroppedIterations(result)) warnings.push(`${label} run contains dropped iterations`);
      continue;
    }

    if (readMetricValue(result, 'ws_authentication_success', 'rate') < 1) {
      warnings.push(`${label} run contains failed WebSocket authentications`);
    }
    if (readMetricValue(result, 'ws_message_create_success', 'rate') < 1) {
      warnings.push(`${label} run contains failed message creations`);
    }
    if (readMetricValue(result, 'ws_delivery_success', 'rate') < 1) {
      warnings.push(`${label} run contains missed sender deliveries`);
    }
    if (readMetricValue(result, 'ws_unexpected_disconnects', 'count')) {
      warnings.push(`${label} run contains unexpected WebSocket disconnects`);
    }
    if (readMetricValue(result, 'ws_duplicate_deliveries', 'count')) {
      warnings.push(`${label} run contains duplicate WebSocket deliveries`);
    }
    if (readMetricValue(result, 'ws_protocol_errors', 'count')) {
      warnings.push(`${label} run contains WebSocket protocol errors`);
    }
  }

  if (latencyRows.some(row => row['before samples'] === null || row['after samples'] === null)) {
    warnings.push('sample counts are unavailable in one or both legacy results');
  }

  return warnings;
}

const selection = await selectResults();
assertComparable(selection.before.result, selection.after.result);
const selectedWorkload = workload(selection.before.result);
const rows =
  selectedWorkload === 'websocket'
    ? websocketLatencyMetrics.map(([label, metricName]) =>
        latencyRow(label, selection.before.result, selection.after.result, metricName)
      )
    : [
        latencyRow('overall', selection.before.result, selection.after.result, 'http_req_duration'),
        ...endpointNames.map(endpoint =>
          latencyRow(
            endpoint,
            selection.before.result,
            selection.after.result,
            'http_req_duration',
            endpoint
          )
        )
      ];
const warnings = [
  ...selection.warnings,
  ...reliabilityWarnings(selection.before.result, selection.after.result, rows)
];

console.log(`Selection: ${selection.mode}`);
console.log(`Workload: ${selectedWorkload}`);
console.log(`Profile: ${selection.before.result.run.profile}`);
console.log(`API replicas: ${selection.before.result.run.apiReplicas}`);
console.log(`Before: ${selection.before.displayPath}`);
console.log(`After: ${selection.after.displayPath}`);
const createRunRow = selectedWorkload === 'websocket' ? websocketRunRow : httpRunRow;
console.table([createRunRow('before', selection.before), createRunRow('after', selection.after)]);
console.table(rows);

for (const warning of warnings) console.warn(`Warning: ${warning}`);

console.log(
  'Single-run differences are directional; use repeated runs before claiming a regression.'
);
