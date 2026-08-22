import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpointNames = ['conversation_list', 'message_list', 'user_search', 'message_create'];
const [beforeArgument, afterArgument] = process.argv.slice(2);

if (!beforeArgument || !afterArgument) {
  throw new Error('Usage: npm run perf:compare -- <before-result.json> <after-result.json>');
}

async function readResult(filePath) {
  const resolvedPath = resolve(filePath);
  const result = JSON.parse(await readFile(resolvedPath, 'utf8'));

  if (result.schemaVersion !== 1 || !result.run || !result.metrics) {
    throw new Error(`${filePath} is not a supported Relay performance result`);
  }

  return { filePath, result };
}

function assertComparable(before, after) {
  if (before.run.profile !== after.run.profile) {
    throw new Error('Performance results use different profiles');
  }

  if (before.run.apiReplicas !== after.run.apiReplicas) {
    throw new Error('Performance results use different API replica counts');
  }

  if (
    JSON.stringify(before.configuration.scenarios) !== JSON.stringify(after.configuration.scenarios)
  ) {
    throw new Error('Performance results use different scenario configurations');
  }
}

function readMetricValue(result, metricName, valueName) {
  const value = result.metrics[metricName]?.values?.[valueName];
  return typeof value === 'number' ? value : null;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function comparisonRow(label, beforeValue, afterValue) {
  if (beforeValue === null || afterValue === null) {
    return { metric: label, before: beforeValue, after: afterValue, improvement: null };
  }

  const improvement = beforeValue ? ((beforeValue - afterValue) / beforeValue) * 100 : 0;

  return {
    metric: label,
    before: round(beforeValue),
    after: round(afterValue),
    improvement: `${round(improvement)}%`
  };
}

const beforeFile = await readResult(beforeArgument);
const afterFile = await readResult(afterArgument);
assertComparable(beforeFile.result, afterFile.result);

const rows = [
  comparisonRow(
    'overall p95 ms',
    readMetricValue(beforeFile.result, 'http_req_duration', 'p(95)'),
    readMetricValue(afterFile.result, 'http_req_duration', 'p(95)')
  ),
  ...endpointNames.map(endpoint =>
    comparisonRow(
      `${endpoint} p95 ms`,
      readMetricValue(beforeFile.result, `http_req_duration{endpoint:${endpoint}}`, 'p(95)'),
      readMetricValue(afterFile.result, `http_req_duration{endpoint:${endpoint}}`, 'p(95)')
    )
  )
];

console.log(`Profile: ${beforeFile.result.run.profile}`);
console.log(`API replicas: ${beforeFile.result.run.apiReplicas}`);
console.log(`Before: ${beforeFile.filePath}`);
console.log(`After: ${afterFile.filePath}`);
console.table(rows);
