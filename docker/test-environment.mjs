import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const composeArguments = [
  'compose',
  '--project-name',
  'relay-test',
  '-f',
  'docker-compose.test.yml',
  '-f',
  'docker-compose.test.inspect.yml'
];
const dockerEnvironment = { ...process.env, COMPOSE_PROJECT_NAME: 'relay-test' };
const testEnvironment = {
  ...process.env,
  COMPOSE_PROJECT_NAME: 'relay-test',
  NODE_ENV: 'test',
  TEST_ENV_GUARD: 'relay-test',
  PORT: '3000',
  MYSQL_URL: 'mysql://relay_test:relay_test@127.0.0.1:13306/relay_test?charset=utf8mb4',
  REDIS_URL: 'redis://127.0.0.1:16379/15',
  REDIS_NAMESPACE: 'relay-test',
  BCRYPT_COST: '10',
  JWT_ACCESS_SECRET: 'relay-test-access-secret-with-at-least-32-characters',
  JWT_ISSUER: 'relay-test-api',
  JWT_AUDIENCE: 'relay-test-client',
  JWT_ACCESS_TTL_SECONDS: '300',
  REFRESH_TOKEN_TTL_SECONDS: '3600',
  DEMO_USER_PASSWORD: 'RelayTest123!',
  TEST_BASE_URL: 'http://127.0.0.1:13000',
  TEST_WS_URL: 'ws://127.0.0.1:13000',
  TEST_PRIMARY_BASE_URL: 'http://127.0.0.1:13001',
  TEST_PRIMARY_WS_URL: 'ws://127.0.0.1:13001',
  TEST_SECONDARY_BASE_URL: 'http://127.0.0.1:13002',
  TEST_SECONDARY_WS_URL: 'ws://127.0.0.1:13002',
  TEST_ENVOY_ADMIN_URL: 'http://127.0.0.1:19902'
};
const readinessTimeoutMs = 30000;
const readinessRequestTimeoutMs = 2000;
const readinessPollIntervalMs = 250;
const cleanupTimeoutMs = 60000;
const testCommandTimeoutMs = 15 * 60000;
const forceKillDelayMs = 5000;

let activeChild;
let receivedSignal;
let cleaningUp = false;

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

function run(
  command,
  arguments_,
  { environment = process.env, processGroup = false, timeoutMs } = {}
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const useProcessGroup = processGroup && process.platform !== 'win32';
    const child = spawn(command, arguments_, {
      cwd: projectDirectory,
      detached: useProcessGroup,
      env: environment,
      stdio: 'inherit'
    });
    const activeProcess = { child, processGroup: useProcessGroup };
    let settled = false;
    let timedOut = false;
    let forceKillTimer;
    let timeoutTimer;
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

async function removeTestEnvironment() {
  cleaningUp = true;

  try {
    await run('docker', [...composeArguments, 'down', '--volumes', '--remove-orphans'], {
      environment: dockerEnvironment,
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
      const response = await fetch(`${testEnvironment.TEST_BASE_URL}/health/ready`, {
        signal: AbortSignal.timeout(readinessRequestTimeoutMs)
      });
      if (response.ok) return;
      lastError = new Error(`Test API readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, readinessPollIntervalMs));
  }

  throw new Error('Test API did not become ready through Envoy', { cause: lastError });
}

async function runTestEnvironment() {
  const command = process.argv.slice(2);
  if (command[0] === '--') command.shift();

  await removeTestEnvironment();
  if (receivedSignal) return;

  let operationError;

  try {
    await run(
      'docker',
      [
        ...composeArguments,
        'up',
        '--detach',
        '--build',
        '--scale',
        'api=2',
        '--wait',
        '--wait-timeout',
        '180'
      ],
      { environment: dockerEnvironment }
    );
    await waitForReadiness();

    if (command.length) {
      await run(command[0], command.slice(1), {
        environment: testEnvironment,
        processGroup: true,
        timeoutMs: testCommandTimeoutMs
      });
    }
  } catch (error) {
    operationError = error;
  }

  let cleanupError;

  try {
    await removeTestEnvironment();
  } catch (error) {
    cleanupError = error;
  }

  if (operationError && cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      'Test command and environment cleanup both failed'
    );
  }

  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (receivedSignal) return;
    receivedSignal = signal;
    if (!cleaningUp && activeChild) signalChild(activeChild, signal);
  });
}

try {
  await runTestEnvironment();
} catch (error) {
  if (!receivedSignal) console.error(error);
  process.exitCode = 1;
}

if (receivedSignal === 'SIGINT') process.exitCode = 130;
if (receivedSignal === 'SIGTERM') process.exitCode = 143;
