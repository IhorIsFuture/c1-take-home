import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPerformanceProfile } from '../tests/performance/profiles.js';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDirectory = resolve(projectDirectory, 'performance', 'results');
const composeArguments = [
  'compose',
  '--project-name',
  'relay-perf',
  '-f',
  'docker-compose.perf.yml'
];
const supportedProfiles = new Set(['smoke', 'baseline', 'load', 'stress']);
const profile = process.argv[2] || 'baseline';
const apiReplicas = Number(process.env.PERF_API_REPLICAS ?? 2);
const userCount = Number(process.env.PERF_USER_COUNT ?? 100);
const conversationCount = Number(process.env.PERF_CONVERSATION_COUNT ?? 200);
const messagesPerConversation = Number(process.env.PERF_MESSAGES_PER_CONVERSATION ?? 50);
const firstConversationId = 10_000;
const readinessTimeoutMs = 60_000;
const readinessRequestTimeoutMs = 2_000;
const readinessPollIntervalMs = 250;
const cleanupTimeoutMs = 90_000;
const testTimeoutMs = 20 * 60_000;
const forceKillDelayMs = 5_000;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resultFileName = `${runId}-${profile}.json`;

if (!supportedProfiles.has(profile)) {
  throw new Error(`Performance profile must be one of: ${[...supportedProfiles].join(', ')}`);
}

if (!Number.isInteger(apiReplicas) || apiReplicas < 1 || apiReplicas > 8) {
  throw new Error('PERF_API_REPLICAS must be an integer between 1 and 8');
}

if (!Number.isInteger(userCount) || userCount < 2 || userCount > 10_000) {
  throw new Error('PERF_USER_COUNT must be an integer between 2 and 10000');
}

if (!Number.isInteger(conversationCount) || conversationCount < 1 || conversationCount > 10_000) {
  throw new Error('PERF_CONVERSATION_COUNT must be an integer between 1 and 10000');
}

if (
  !Number.isInteger(messagesPerConversation) ||
  messagesPerConversation < 1 ||
  messagesPerConversation > 1_000
) {
  throw new Error('PERF_MESSAGES_PER_CONVERSATION must be an integer between 1 and 1000');
}

if (conversationCount * messagesPerConversation > 100_000) {
  throw new Error('Performance dataset cannot exceed 100000 messages');
}

const profileConfiguration = getPerformanceProfile(profile);

let activeChild;
let receivedSignal;
let cleaningUp = false;

function readGitValue(arguments_) {
  try {
    return execFileSync('git', arguments_, {
      cwd: projectDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function signalChild(activeProcess, signal) {
  const { child, processGroup } = activeProcess;
  if (child.exitCode !== null || child.signalCode) return;

  if (processGroup && child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error.code === 'ESRCH') return;
    }
  }

  child.kill(signal);
}

function run(command, arguments_, { processGroup = false, timeoutMs } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const useProcessGroup = processGroup && process.platform !== 'win32';
    const child = spawn(command, arguments_, {
      cwd: projectDirectory,
      detached: useProcessGroup,
      env: process.env,
      stdio: 'inherit'
    });
    const activeProcess = { child, processGroup: useProcessGroup };
    let settled = false;
    let timedOut = false;
    let timeoutTimer;
    let forceKillTimer;
    activeChild = activeProcess;

    const settle = error => {
      if (settled) return;
      settled = true;
      if (activeChild === activeProcess) activeChild = undefined;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);

      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise();
    };

    child.once('error', settle);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        settle();
        return;
      }

      const reason = timedOut
        ? `timed out after ${timeoutMs}ms`
        : signal
          ? `exited with signal ${signal}`
          : `exited with code ${code ?? 1}`;
      settle(new Error(`${command} ${reason}`));
    });

    if (timeoutMs) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        signalChild(activeProcess, 'SIGTERM');
        forceKillTimer = setTimeout(() => signalChild(activeProcess, 'SIGKILL'), forceKillDelayMs);
        forceKillTimer.unref();
      }, timeoutMs);
      timeoutTimer.unref();
    }
  });
}

async function removePerformanceEnvironment() {
  cleaningUp = true;

  try {
    await run('docker', [...composeArguments, 'down', '--volumes', '--remove-orphans'], {
      timeoutMs: cleanupTimeoutMs
    });
  } finally {
    cleaningUp = false;
  }
}

async function waitForReadiness() {
  const deadline = Date.now() + readinessTimeoutMs;
  let lastError;

  while (Date.now() < deadline && !receivedSignal) {
    try {
      const response = await fetch('http://127.0.0.1:14000/health/ready', {
        signal: AbortSignal.timeout(readinessRequestTimeoutMs)
      });

      if (response.ok) return;
      lastError = new Error(`Performance API readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, readinessPollIntervalMs));
  }

  throw new Error('Performance API did not become ready through Envoy', { cause: lastError });
}

async function runK6Profile(testProfile, metadata, resultFile) {
  const environmentArguments = [
    '-e',
    `K6_PROFILE=${testProfile}`,
    '-e',
    'K6_BASE_URL=http://envoy:3000',
    '-e',
    'K6_USER_EMAIL=performance-user-1@example.com',
    '-e',
    'K6_USER_PASSWORD=RelayPerf123!',
    '-e',
    `K6_RUN_ID=${runId}`,
    '-e',
    `K6_GIT_COMMIT=${metadata.gitCommit}`,
    '-e',
    `K6_GIT_DIRTY=${metadata.gitDirty}`,
    '-e',
    `K6_API_REPLICAS=${apiReplicas}`,
    '-e',
    'K6_ENGINE_VERSION=2.2.0',
    '-e',
    `K6_FIRST_CONVERSATION_ID=${firstConversationId}`,
    '-e',
    `K6_USER_COUNT=${userCount}`,
    '-e',
    `K6_CONVERSATION_COUNT=${conversationCount}`,
    '-e',
    `K6_MESSAGES_PER_CONVERSATION=${messagesPerConversation}`
  ];

  if (resultFile) environmentArguments.push('-e', `K6_RESULT_FILE=/results/${resultFile}`);

  console.log(
    resultFile
      ? `Measuring performance profile: ${testProfile}`
      : `Preconditioning performance environment: ${testProfile}`
  );

  await run(
    'docker',
    [
      ...composeArguments,
      'run',
      '--rm',
      '--no-deps',
      '-T',
      ...environmentArguments,
      'k6',
      'run',
      '/scripts/workload.js'
    ],
    { processGroup: true, timeoutMs: testTimeoutMs }
  );
}

async function runPerformanceTest() {
  await mkdir(resultsDirectory, { recursive: true });
  await removePerformanceEnvironment();
  if (receivedSignal) return;

  const gitCommit = readGitValue(['rev-parse', '--short', 'HEAD']) || 'unknown';
  const gitDirty = !!readGitValue(['status', '--porcelain']);
  let operationError;

  try {
    await run(
      'docker',
      [
        ...composeArguments,
        'up',
        '--detach',
        '--build',
        '--wait',
        '--wait-timeout',
        '300',
        '--scale',
        `api=${apiReplicas}`
      ],
      { timeoutMs: 10 * 60_000 }
    );
    await waitForReadiness();

    const metadata = { gitCommit, gitDirty };
    const preconditioning = profileConfiguration.preconditioning;

    if (preconditioning) {
      await runK6Profile(preconditioning.profile, metadata);
      await new Promise(resolvePromise =>
        setTimeout(resolvePromise, preconditioning.settleDelayMs)
      );
    }

    await runK6Profile(profile, metadata, resultFileName);
  } catch (error) {
    operationError = error;
  }

  let cleanupError;

  try {
    await removePerformanceEnvironment();
  } catch (error) {
    cleanupError = error;
  }

  if (operationError && cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      'Performance test and environment cleanup both failed'
    );
  }

  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;

  console.log(`Performance result: performance/results/${resultFileName}`);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (receivedSignal) return;
    receivedSignal = signal;
    if (!cleaningUp && activeChild) signalChild(activeChild, signal);
  });
}

try {
  await runPerformanceTest();
} catch (error) {
  if (!receivedSignal) console.error(error);
  process.exitCode = 1;
}

if (receivedSignal === 'SIGINT') process.exitCode = 130;
if (receivedSignal === 'SIGTERM') process.exitCode = 143;
