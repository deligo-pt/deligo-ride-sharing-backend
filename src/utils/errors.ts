import { ZodError } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Custom Application Error Hierarchy
//
// All operational errors extend AppError, which carries an HTTP status code
// and a machine-readable error code for the client. This lets the global
// error handler differentiate between programmer errors (bugs) and known
// operational failures without any instanceof checks scattered around the app.
// ─────────────────────────────────────────────────────────────────────────────

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

    // Restore prototype chain (required when extending built-in classes in TS)
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 400 Bad Request ─────────────────────────────────────────────────────────
export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown, code = 'BAD_REQUEST') {
    super(message, 400, code, details);
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────────
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  // `options.message` replaces the default "<resource> not found" text, and
  // `options.code` lets a domain use a more specific machine-readable code.
  constructor(resource = 'Resource', options: { message?: string; code?: string } = {}) {
    super(options.message ?? `${resource} not found`, 404, options.code ?? 'NOT_FOUND');
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

// ─── 422 Unprocessable Entity ────────────────────────────────────────────────
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

// ─── 429 Too Many Requests ───────────────────────────────────────────────────
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// ─── 500 Internal Server Error ───────────────────────────────────────────────
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred', code = 'INTERNAL_SERVER_ERROR') {
    super(message, 500, code, undefined, false);
  }
}

// ─── Controller helper ───────────────────────────────────────────────────────
// For handlers that call services which throw plain `Error`s. Converts whatever
// was caught into an AppError so it can be forwarded with `next(...)` to the
// global error handler:
//   - an AppError is returned untouched
//   - a ZodError becomes a 400 BadRequestError (VALIDATION_ERROR)
//   - anything else becomes the AppError subclass for `failure.statusCode`,
//     keeping the original error message when it has one.

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
