import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown, code = 'BAD_REQUEST') {
    super(message, 400, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', options: { message?: string; code?: string } = {}) {
    super(options.message ?? `${resource} not found`, 404, options.code ?? 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred', code = 'INTERNAL_SERVER_ERROR') {
    super(message, 500, code, undefined, false);
  }
}

export interface ControllerFailure {
  statusCode: 400 | 404 | 500;
  code: string;
  message: string;
}

export function toAppError(error: unknown, failure: ControllerFailure): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new BadRequestError(
      error.issues[0]?.message ?? 'Validation failed',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      'VALIDATION_ERROR',
    );
  }

  const message = (error as { message?: string } | null)?.message ?? failure.message;

  switch (failure.statusCode) {
    case 404:
      return new NotFoundError('Resource', { message, code: failure.code });
    case 500:
      return new InternalError(message, failure.code);
    default:
      return new BadRequestError(message, undefined, failure.code);
  }
}
