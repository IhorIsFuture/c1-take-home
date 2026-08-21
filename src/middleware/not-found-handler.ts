import type { RequestHandler } from 'express';
import { HttpError } from '../errors/http-error';

export const notFoundHandler: RequestHandler = () => {
  throw new HttpError(404, 'ROUTE_NOT_FOUND', 'Route not found');
};
