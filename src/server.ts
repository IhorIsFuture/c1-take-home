import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { WebSocketServer } from 'ws';
import { createApp } from './app';
import { config } from './config';
import { connectMongo, disconnectMongo, isMongoReady } from './db/mongo';
import { connectMysql, disconnectMysql, isMysqlReady } from './db/mysql';
import { InProcessRealtimePublisher } from './realtime/index';
import { conversationRepository } from './repositories/conversation-repository';
import { verifyAccessToken } from './security/access-token';
import { attachWs } from './ws/hub';

const shutdownGracePeriodMs = 5_000;
const readinessTimeoutMs = 2_500;

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
  connections: { mongo: boolean; mysql: boolean }
): Promise<void> {
  const transportResults = await Promise.allSettled([
    closeHttpServer(server),
    closeWebSocketServer(webSocketServer)
  ]);
  const databaseResults = await Promise.allSettled([
    ...(connections.mongo ? [disconnectMongo()] : []),
    ...(connections.mysql ? [disconnectMysql()] : [])
  ]);
  const errors = [...transportResults, ...databaseResults]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => result.reason);

  if (errors.length) throw new AggregateError(errors, 'Failed to stop server');
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  let ready = false;
  let dependencyReadinessCheck: Promise<boolean> | undefined;
  const connections = { mongo: false, mysql: false };
  const server = http.createServer();
  const { webSocketServer, broadcast } = attachWs(server, {
    verifyAccessToken,
    canAccessConversations: (userId, conversationIds) =>
      conversationRepository.hasAccessToAll(userId, conversationIds)
  });
  const realtimePublisher = new InProcessRealtimePublisher(broadcast);
  const app = createApp({
    realtimePublisher,
    checkReadiness: async () => {
      if (!ready) return false;

      dependencyReadinessCheck ??= Promise.all([isMysqlReady(), isMongoReady()])
        .then(([mysqlReady, mongoReady]) => mysqlReady && mongoReady)
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
    await connectMongo();
    connections.mongo = true;
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
        stopPromise ??= stopResources(server, webSocketServer, connections);
        return stopPromise;
      }
    };
  } catch (error) {
    ready = false;
    await stopResources(server, webSocketServer, connections).catch(() => undefined);
    throw error;
  }
}
