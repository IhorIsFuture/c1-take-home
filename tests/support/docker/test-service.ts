import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const composeArguments = [
  'compose',
  '--project-name',
  'relay-test',
  '-f',
  'docker-compose.test.yml',
  '-f',
  'docker-compose.test.inspect.yml'
];

export async function stopRedisTestService(): Promise<void> {
  await execFileAsync('docker', [...composeArguments, 'stop', 'redis'], {
    cwd: projectDirectory
  });
}

export async function startRedisTestService(): Promise<void> {
  await execFileAsync('docker', [...composeArguments, 'start', 'redis'], {
    cwd: projectDirectory
  });
}
