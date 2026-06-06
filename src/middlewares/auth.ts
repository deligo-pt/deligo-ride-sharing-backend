import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { JwtPayload } from '../types/auth.types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Middleware
//
// Verifies the Bearer JWT in the Authorization header and attaches the
// decoded user payload to req.user. Throws UnauthorizedError if the token
// is missing, malformed, or expired.
// ─────────────────────────────────────────────────────────────────────────────

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No bearer token provided');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    // JWT errors are handled by the global error handler
    throw new UnauthorizedError('Invalid or expired token');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization Middleware Factory
//
// Usage: authorize(UserRole.ADMIN) or authorize(UserRole.DRIVER, UserRole.ADMIN)
// Throws ForbiddenError if the authenticated user's role is not included.
// Must be used AFTER the authenticate middleware.
// ─────────────────────────────────────────────────────────────────────────────

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      );
    }

    next();
  };
}
