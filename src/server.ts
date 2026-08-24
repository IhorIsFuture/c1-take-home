import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { WebSocketServer } from 'ws';
import { createApp } from './app';
import { config } from './config';
import { connectMysql, disconnectMysql, isMysqlReady } from './db/mysql';
import { OutboxRelay } from './outbox/outbox-relay';
import { RedisRealtimePubSub } from './realtime/index';
import { verifyAccessToken } from './security/access-token';
import { setLegacyBodyReader } from './services/messages';
import { attachWs } from './ws/hub';

const shutdownGracePeriodMs = 5000;
const readinessTimeoutMs = 2500;

export interface StartServerOptions {
  port?: number;
}

export interface RunningServer {
  app: Express;
  server: Server;
  webSocketServer: WebSocketServer;
  port: number;
  stop: () => Promise<void>;
}

interface LegacyRuntime {
  connectMongo(): Promise<void>;
  disconnectMongo(): Promise<void>;
  isMongoReady(): Promise<boolean>;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening);
      reject(error);
    };

    const handleListening = (): void => {
      server.off('error', handleError);
      const address = server.address() as AddressInfo | null;

      if (!address) {
        reject(new Error('server address is unavailable'));
        return;
      }

      resolve(address.port);
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port);
  });
}

function waitForReadiness(check: Promise<boolean>): Promise<boolean> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(false), readinessTimeoutMs);

    void check.then(
      ready => {
        clearTimeout(timeout);
        resolve(ready);
      },
      () => {
        clearTimeout(timeout);
        resolve(false);
      }
    );
  });
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let completed = false;

    const complete = (error?: Error): void => {
      if (completed) return;
      completed = true;
      clearTimeout(shutdownTimer);

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const shutdownTimer = setTimeout(() => {
      server.closeAllConnections();
      complete();
    }, shutdownGracePeriodMs);

    server.close(complete);
    server.closeIdleConnections();
  });
}

function closeWebSocketServer(webSocketServer: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = false;

    const complete = (error?: Error): void => {
      if (completed) return;
      completed = true;
      clearTimeout(shutdownTimer);

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const shutdownTimer = setTimeout(() => {
      for (const client of webSocketServer.clients) client.terminate();
      complete();
    }, shutdownGracePeriodMs);

    webSocketServer.close(complete);

    for (const client of webSocketServer.clients) {
      client.close(1001, 'Server shutting down');
    }
  });
}

async function stopResources(
  server: Server,
  webSocketServer: WebSocketServer,
  realtimePubSub: RedisRealtimePubSub,
  outboxRelay: OutboxRelay,
  legacyRuntime: LegacyRuntime | undefined,
  connections: { mongo: boolean; mysql: boolean; redis: boolean }
): Promise<void> {
  await outboxRelay.stop();
  const transportResults = await Promise.allSettled([
    closeHttpServer(server),
    closeWebSocketServer(webSocketServer)
  ]);
  const realtimeResults = await Promise.allSettled([
    ...(connections.redis ? [realtimePubSub.close()] : [])
  ]);
  const databaseResults = await Promise.allSettled([
    ...(connections.mongo && legacyRuntime ? [legacyRuntime.disconnectMongo()] : []),
    ...(connections.mysql ? [disconnectMysql()] : [])
  ]);
  const errors = [...transportResults, ...realtimeResults, ...databaseResults]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => result.reason);

  if (errors.length) throw new AggregateError(errors, 'Failed to stop server');
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  let ready = false;
  let dependencyReadinessCheck: Promise<boolean> | undefined;
  let legacyRuntime: LegacyRuntime | undefined;
  const connections = { mongo: false, mysql: false, redis: false };
  const server = http.createServer();
  const { webSocketServer, deliver, broadcast } = attachWs(server, { verifyAccessToken });
  const realtimePubSub = new RedisRealtimePubSub({
    url: config.redisUrl,
    namespace: config.redisNamespace,
    onSubscriberUnavailable: () => broadcast({ type: 'realtime_unavailable' }),
    onSubscriberRecovered: () => broadcast({ type: 'resync_required' })
  });
  const outboxRelay = new OutboxRelay(realtimePubSub, {
    ...config.outbox,
    requireMirroredForCleanup: config.messageBodyCompat === 'transition'
  });
  const app = createApp({
    realtimePublisher: realtimePubSub,
    checkReadiness: async () => {
      if (!ready) return false;

      dependencyReadinessCheck ??= Promise.all([
        isMysqlReady(),
        legacyRuntime ? legacyRuntime.isMongoReady() : Promise.resolve(true),
        realtimePubSub.isReady()
      ])
        .then(([mysqlReady, mongoReady, redisReady]) => mysqlReady && mongoReady && redisReady)
        .finally(() => {
          dependencyReadinessCheck = undefined;
        });

      return waitForReadiness(dependencyReadinessCheck);
    }
  });
  server.on('request', app);

  try {
    await connectMysql();
    connections.mysql = true;

    if (config.messageBodyCompat === 'transition') {
      const legacy = await import('./legacy/runtime');
      legacyRuntime = legacy;
      await legacy.connectMongo();
      connections.mongo = true;
      setLegacyBodyReader(legacy.createLegacyBodyReader());
    } else {
      setLegacyBodyReader(null);
    }

    await realtimePubSub.start(({ recipientUserIds, event }) => {
      if (event.type !== 'message.created') return;
      deliver(recipientUserIds, { type: 'message', ...event.message });
    });
    connections.redis = true;
    outboxRelay.start();
    const port = await listen(server, options.port ?? config.port);
    ready = true;
    let stopPromise: Promise<void> | undefined;

    return {
      app,
      server,
      webSocketServer,
      port,
      stop: () => {
        ready = false;
        stopPromise ??= stopResources(
          server,
          webSocketServer,
          realtimePubSub,
          outboxRelay,
          legacyRuntime,
          connections
        );
        return stopPromise;
      }
    };
  } catch (error) {
    ready = false;
    await stopResources(
      server,
      webSocketServer,
      realtimePubSub,
      outboxRelay,
      legacyRuntime,
      connections
    ).catch(() => undefined);
    throw error;
  }
}
