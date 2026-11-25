import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { ErrorSource, errorResponse } from '../types/api.types';
import { config } from '../config';
import { persistErrorLog, shouldPersistError } from '../utils/errorLogger';

interface ResolvedError {
  statusCode: number;
  message: string;
  code: string;
  errorSources?: ErrorSource[];
}

const isErrorSource = (value: unknown): value is ErrorSource =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ErrorSource).path === 'string' &&
  typeof (value as ErrorSource).message === 'string';

function toErrorSources(details: unknown): ErrorSource[] | undefined {
  if (Array.isArray(details) && details.length > 0 && details.every(isErrorSource)) {
    return details;
  }

  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    const entries = Object.entries(details);
    if (
      entries.length > 0 &&
      entries.every(([, v]) => Array.isArray(v) && v.every((m: unknown) => typeof m === 'string'))
    ) {
      return entries.flatMap(([path, messages]) =>
        (messages as string[]).map((message) => ({ path, message })),
      );
    }
  }

  return undefined;
}

function resolveError(err: unknown): ResolvedError {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      message: err.message,
      code: err.code,
      errorSources: toErrorSources(err.details),
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 422,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errorSources: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return {
      statusCode: tooLarge ? 413 : 400,
      message: tooLarge ? 'File is too large (max 10 MB per file)' : err.message,
      code: tooLarge ? 'FILE_TOO_LARGE' : err.code,
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = err.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : 'field';
        return {
          statusCode: 409,
          message: `A record with this ${fields} already exists`,
          code: 'CONFLICT',
        };
      }
      case 'P2025':
        return {
          statusCode: 404,
          message: 'The requested record was not found',
          code: 'NOT_FOUND',
        };
      case 'P2003':
        return {
          statusCode: 400,
          message: 'Related record does not exist',
          code: 'FOREIGN_KEY_CONSTRAINT',
        };
      case 'P2014':
        return {
          statusCode: 400,
          message: 'Invalid relation data provided',
          code: 'INVALID_RELATION',
        };
      default:
        console.error(`[Prisma Error ${err.code}]`, err.message);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[Prisma Validation Error]', err.message);
    return {
      statusCode: 400,
      message: 'Invalid data sent to the database',
      code: 'DATABASE_VALIDATION_ERROR',
    };
  }

  if (err instanceof Error) {
    if (err.name === 'JsonWebTokenError') {
      return { statusCode: 401, message: 'Invalid token', code: 'INVALID_TOKEN' };
    }
    if (err.name === 'TokenExpiredError') {
      return { statusCode: 401, message: 'Token has expired', code: 'TOKEN_EXPIRED' };
    }
    if (err.name === 'NotBeforeError') {
      return { statusCode: 401, message: 'Token not yet active', code: 'TOKEN_NOT_ACTIVE' };
    }
  }

  console.error('[Unhandled Error]', err);
  return {
    statusCode: 500,
    message: 'An unexpected internal server error occurred',
    code: 'INTERNAL_SERVER_ERROR',
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const resolved = resolveError(err);
  const stack = err instanceof Error ? err.stack : undefined;

  res.status(resolved.statusCode).json(
    errorResponse(resolved.statusCode, resolved.message, resolved.code, {
      errorSources: resolved.errorSources,
      stack: config.isDevelopment ? stack : undefined,
    }),
  );

  if (shouldPersistError(resolved.statusCode)) {
    persistErrorLog(req, {
      statusCode: resolved.statusCode,
      code: resolved.code,
      message: err instanceof Error && err.message ? err.message : resolved.message,
      errorSources: resolved.errorSources,
      stack,
    });
  }
}
