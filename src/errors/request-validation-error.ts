import { HttpError } from './http-error';

interface ValidationIssue {
  message: string;
  path: PropertyKey[];
}

export class RequestValidationError extends HttpError {
  constructor(issues: readonly ValidationIssue[]) {
    super(
      400,
      'REQUEST_VALIDATION_FAILED',
      'Request validation failed',
      issues.map(issue => ({
        field: issue.path.map(String).join('.'),
        message: issue.message
      }))
    );
    this.name = 'RequestValidationError';
  }
}
