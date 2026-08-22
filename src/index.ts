import { startServer } from './server';

const server = await startServer();

console.log(`relay listening on :${server.port}`);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`relay received ${signal}, shutting down`);

  try {
    await server.stop();
    console.log('relay stopped');
  } catch (error) {
    console.error('Failed to stop relay', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
