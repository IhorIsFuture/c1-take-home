import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  console.error(`${request.method} ${request.originalUrl}`, error);
  response.status(500).json({ error: 'Internal server error' });
};
