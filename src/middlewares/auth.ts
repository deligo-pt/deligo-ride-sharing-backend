import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../config/db';
import { env } from '../config/env';
import { config } from '../config';
import { redis } from '../utils/redis';
import { JwtPayload } from '../types/auth.types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Middleware
//
// Verifies the Bearer JWT in the Authorization header and attaches the
// decoded user payload to req.user. Checks Redis blacklist to prevent revoked
// tokens from being used. Throws UnauthorizedError if the token is missing,
// malformed, expired, or revoked.
// ─────────────────────────────────────────────────────────────────────────────

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No bearer token provided');
    }

    const token = authHeader.slice(7);
    const secret = config.jwt.accessSecret || env.JWT_SECRET;
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch {
      if (env.JWT_SECRET && env.JWT_SECRET !== secret) {
        try {
          payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        } catch {
          throw new UnauthorizedError('Invalid or expired token');
        }
      } else {
        throw new UnauthorizedError('Invalid or expired token');
      }
    }

    // Check Redis token blacklist
    if (payload.jti) {
      const isBlacklisted = await redis.get(`blacklist:token:${payload.jti}`);
      if (isBlacklisted) {
        throw new UnauthorizedError('Token has been revoked');
      }
    }

    req.user = {
      id: payload.sub,
      email: payload.email ?? undefined,
      role: payload.role,
      sessionId: payload.sessionId,
      jti: payload.jti,
    };
    next();
  } catch (err) {
    next(err);
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
      throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }

    next();
  };
}

/**
 * Role-checking middleware supporting extended roles (e.g. 'ADMIN', 'SUPER_ADMIN').
 * Resolves effective role from AdminProfile if the user has role 'ADMIN'.
 */
export function requireRole(...allowedRoles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      let effectiveRole = req.user.role;
      if (effectiveRole === 'ADMIN' && allowedRoles.includes('SUPER_ADMIN')) {
        const adminProfile = await prisma.adminProfile.findUnique({
          where: { userId: req.user.id },
        });
        if (adminProfile?.accessLabel === 'SUPER_ADMIN') {
          effectiveRole = 'SUPER_ADMIN';
        }
      }

      if (!allowedRoles.includes(effectiveRole) && !allowedRoles.includes(req.user.role)) {
        throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
      }

      req.user.role = effectiveRole;
      next();
    } catch (err) {
      next(err);
    }
  };
}
