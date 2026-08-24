import { Router } from 'express';
import { loginHandler, logoutHandler, refreshHandler, registerHandler } from '../handlers/auth';
import { withValidation } from '../middleware/validate-request';
import type { RateLimiter } from '../rate-limit/redis-rate-limiter';
import { loginRequestSchema, registerRequestSchema } from '../validation/auth';

export function createAuthRouter(rateLimiter: RateLimiter): Router {
  const authRouter = Router();

  authRouter.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    response.set('Pragma', 'no-cache');
    next();
  });
  authRouter.post('/register', withValidation(registerRequestSchema, registerHandler(rateLimiter)));
  authRouter.post('/login', withValidation(loginRequestSchema, loginHandler(rateLimiter)));
  authRouter.post('/refresh', refreshHandler);
  authRouter.post('/logout', logoutHandler);

  return authRouter;
}
