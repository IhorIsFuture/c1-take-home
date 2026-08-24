import { Router } from 'express';
import { createReadinessHandler, livenessHandler, type ReadinessCheck } from '../handlers/health';

export function createHealthRouter(checkReadiness: ReadinessCheck): Router {
  const healthRouter = Router();

  healthRouter.get('/live', livenessHandler);
  healthRouter.get('/ready', createReadinessHandler(checkReadiness));

  return healthRouter;
}
