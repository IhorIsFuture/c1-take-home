import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../errors/http-error';
import { RateLimitError } from '../errors/rate-limit-error';

interface InvalidJsonError extends SyntaxError {
  status: 400;
  type: 'entity.parse.failed';
}

function isInvalidJsonError(error: unknown): error is InvalidJsonError {
  return (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400 &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    if (error instanceof RateLimitError) {
      response.set('Retry-After', String(error.retryAfterSeconds));
    }

    response.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details })
    });
    return;
  }

  if (isInvalidJsonError(error)) {
    response.status(400).json({
      error: 'Invalid JSON body',
      code: 'INVALID_JSON'
    });
    return;
  }

  console.error(`${request.method} ${request.originalUrl}`, error);
  response.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR'
  });
};
