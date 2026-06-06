import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { errorResponse } from '../types/api.types';

// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handling Middleware
//
// This is the single, centralized place where ALL errors in the app are caught
// and transformed into a consistent JSON response. Never send error responses
// from controllers directly — always throw or pass to next(err).
//
// Error handling order:
//   1. Known operational errors (AppError subclasses)
//   2. Zod validation errors
//   3. Prisma client errors
//   4. JWT errors
//   5. Unknown/programmer errors (generic 500)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── 1. Our own operational errors ────────────────────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      errorResponse(err.message, err.code, err.details),
    );
    return;
  }

  // ── 2. Zod validation errors (schema validation failures) ────────────────
  if (err instanceof ZodError) {
    const details = err.flatten().fieldErrors;
    res.status(422).json(
      errorResponse('Validation failed', 'VALIDATION_ERROR', details),
    );
    return;
  }

  // ── 3. Prisma errors ─────────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        const fields = (err.meta?.target as string[])?.join(', ') ?? 'field';
        res.status(409).json(
          errorResponse(`A record with this ${fields} already exists`, 'CONFLICT'),
        );
        return;
      }
      case 'P2025': {
        // Record not found
        res.status(404).json(
          errorResponse('The requested record was not found', 'NOT_FOUND'),
        );
        return;
      }
      case 'P2003': {
        // Foreign key constraint violation
        res.status(400).json(
          errorResponse('Related record does not exist', 'FOREIGN_KEY_CONSTRAINT'),
        );
        return;
      }
      case 'P2014': {
        res.status(400).json(
          errorResponse('Invalid relation data provided', 'INVALID_RELATION'),
        );
        return;
      }
      default:
        console.error(`[Prisma Error ${err.code}]`, err.message);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json(
      errorResponse('Invalid data sent to the database', 'DATABASE_VALIDATION_ERROR'),
    );
    return;
  }

  // ── 4. JWT errors ─────────────────────────────────────────────────────────
  if (err instanceof Error) {
    if (err.name === 'JsonWebTokenError') {
      res.status(401).json(errorResponse('Invalid token', 'INVALID_TOKEN'));
      return;
    }
    if (err.name === 'TokenExpiredError') {
      res.status(401).json(errorResponse('Token has expired', 'TOKEN_EXPIRED'));
      return;
    }
    if (err.name === 'NotBeforeError') {
      res.status(401).json(errorResponse('Token not yet active', 'TOKEN_NOT_ACTIVE'));
      return;
    }
  }

  // ── 5. Unknown / programmer errors ────────────────────────────────────────
  // Never leak stack traces or internal details to the client in production
  const isDev = process.env.NODE_ENV === 'development';
  console.error('[Unhandled Error]', err);

  res.status(500).json(
    errorResponse(
      'An unexpected internal server error occurred',
      'INTERNAL_SERVER_ERROR',
      isDev && err instanceof Error ? err.stack : undefined,
    ),
  );
}
