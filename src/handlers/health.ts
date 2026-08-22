import type { RequestHandler } from 'express';

export type ReadinessCheck = () => boolean | Promise<boolean>;

export const livenessHandler: RequestHandler = (_request, response) => {
  response.json({ status: 'ok' });
};

export function createReadinessHandler(checkReadiness: ReadinessCheck): RequestHandler {
  return async (_request, response) => {
    let ready: boolean;

    try {
      ready = await checkReadiness();
    } catch {
      response.status(503).json({ status: 'not_ready' });
      return;
    }

    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  };
}
