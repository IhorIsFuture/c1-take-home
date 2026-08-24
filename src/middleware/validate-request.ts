import type { Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { RequestValidationError } from '../errors/request-validation-error';

interface HandlerContext {
  request: Request;
  response: Response;
}

export type ValidatedHandler<Input> = (
  input: Input,
  context: HandlerContext
) => Promise<unknown> | unknown;

export function withValidation<Input>(
  schema: ZodType<Input>,
  handler: ValidatedHandler<Input>
): RequestHandler {
  return async (request, response, next) => {
    const result = schema.safeParse({
      body: request.body,
      params: request.params,
      query: request.query
    });

    if (!result.success) {
      next(new RequestValidationError(result.error.issues));
      return;
    }

    return handler(result.data, { request, response });
  };
}
