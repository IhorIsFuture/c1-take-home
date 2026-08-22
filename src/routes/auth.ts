import { Router } from 'express';
import { loginHandler, logoutHandler, refreshHandler, registerHandler } from '../handlers/auth';
import { withValidation } from '../middleware/validate-request';
import { loginRequestSchema, registerRequestSchema } from '../validation/auth';

export const authRouter = Router();

authRouter.use((_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  response.set('Pragma', 'no-cache');
  next();
});
authRouter.post('/register', withValidation(registerRequestSchema, registerHandler));
authRouter.post('/login', withValidation(loginRequestSchema, loginHandler));
authRouter.post('/refresh', refreshHandler);
authRouter.post('/logout', logoutHandler);
