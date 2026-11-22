import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { ErrorResponseOptions, ErrorSource, errorResponse } from '../types/api.types';

// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handling Middleware
//
// This is the single, centralized place where ALL errors in the app are caught
// and transformed into a consistent JSON response. Never send error responses
// from controllers directly — always throw or pass to next(err).
//
// Every response has the shape  { success: false, statusCode, message, code,
// errorSources?, details?, stack? }  — see ApiErrorResponse.
//
// Error handling order:
//   1. Known operational errors (AppError subclasses)
//   2. Zod validation errors
//   3. Prisma client errors
//   4. JWT errors
//   5. Unknown/programmer errors (generic 500)
// ─────────────────────────────────────────────────────────────────────────────

const isDev = (): boolean => process.env.NODE_ENV === 'development';

/** Stack traces are only ever exposed in development. */
const devStack = (err: unknown): string | undefined =>
  isDev() && err instanceof Error ? err.stack : undefined;

const isErrorSource = (value: unknown): value is ErrorSource =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ErrorSource).path === 'string' &&
  typeof (value as ErrorSource).message === 'string';

/**
 * Splits AppError.details into field-level `errorSources` when it has that shape
 * (an array of { path, message }, or a zod `fieldErrors` map). Anything else is
 * passed through untouched as `details`.
 */
function normalizeDetails(
  details: unknown,
): Pick<ErrorResponseOptions, 'errorSources' | 'details'> {
  if (details === undefined) return {};

  if (Array.isArray(details) && details.length > 0 && details.every(isErrorSource)) {
    return { errorSources: details };
  }

  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    const entries = Object.entries(details);
    if (
      entries.length > 0 &&
      entries.every(([, v]) => Array.isArray(v) && v.every((m: unknown) => typeof m === 'string'))
    ) {
      return {
        errorSources: entries.flatMap(([path, messages]) =>
          (messages as string[]).map((message) => ({ path, message })),
        ),
      };
    }
  }

  return { details };
}

 
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const send = (
    statusCode: number,
    message: string,
    code: string,
    options: ErrorResponseOptions = {},
  ): void => {
    res.status(statusCode).json(errorResponse(statusCode, message, code, options));
  };

  // ── 1. Our own operational errors ────────────────────────────────────────
  if (err instanceof AppError) {
    send(err.statusCode, err.message, err.code, {
      ...normalizeDetails(err.details),
      stack: devStack(err),
    });
    return;
  }

  // ── 2. Zod validation errors (schema validation failures) ────────────────
  if (err instanceof ZodError) {
    send(422, 'Validation failed', 'VALIDATION_ERROR', {
      errorSources: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
      stack: devStack(err),
    });
    return;
  }

  // ── 3. Prisma errors ─────────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const stack = devStack(err);
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        const fields = (err.meta?.target as string[])?.join(', ') ?? 'field';
        send(409, `A record with this ${fields} already exists`, 'CONFLICT', { stack });
        return;
      }
      case 'P2025': {
        // Record not found
        send(404, 'The requested record was not found', 'NOT_FOUND', { stack });
        return;
      }
      case 'P2003': {
        // Foreign key constraint violation
        send(400, 'Related record does not exist', 'FOREIGN_KEY_CONSTRAINT', { stack });
        return;
      }
      case 'P2014': {
        send(400, 'Invalid relation data provided', 'INVALID_RELATION', { stack });
        return;
      }
      default:
        console.error(`[Prisma Error ${err.code}]`, err.message);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[Prisma Validation Error]', err.message);
    send(400, 'Invalid data sent to the database', 'DATABASE_VALIDATION_ERROR', {
      details: err.message,
      stack: devStack(err),
    });
    return;
  }

  // ── 4. JWT errors ─────────────────────────────────────────────────────────
  if (err instanceof Error) {
    const stack = devStack(err);
    if (err.name === 'JsonWebTokenError') {
      send(401, 'Invalid token', 'INVALID_TOKEN', { stack });
      return;
    }
    if (err.name === 'TokenExpiredError') {
      send(401, 'Token has expired', 'TOKEN_EXPIRED', { stack });
      return;
    }
    if (err.name === 'NotBeforeError') {
      send(401, 'Token not yet active', 'TOKEN_NOT_ACTIVE', { stack });
      return;
    }
  }

  // ── 5. Unknown / programmer errors ────────────────────────────────────────
  // Never leak stack traces or internal details to the client in production
  console.error('[Unhandled Error]', err);

  send(500, 'An unexpected internal server error occurred', 'INTERNAL_SERVER_ERROR', {
    stack: devStack(err),
  });
}
