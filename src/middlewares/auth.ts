import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../config/db';
import { config } from '../config';
import { redis } from '../utils/redis';
import { isAccessTokenRevoked } from '../utils/revocation';
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

/**
 * Verifies an access token (signature + expiry), the Redis token blacklist and the
 * Redis user/session revocation markers (see utils/revocation.ts).
 * Shared by the REST `authenticate` middleware and the Socket.IO handshake so
 * both transports accept exactly the same tokens.
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const secret = config.jwt.accessSecret;
  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, secret) as JwtPayload;
  } catch {
    if (config.jwt.secret !== secret) {
      try {
        payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
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

  // Instant revocation: user suspended / sessions revoked / session logged out
  if (await isAccessTokenRevoked(payload)) {
    throw new UnauthorizedError('Session has been revoked. Please sign in again.');
  }

  return payload;
}

/**
 * Confirms the session referenced by a token is still live: it exists, belongs to
 * the token's user, has not been revoked (logout / refresh rotation / reuse
 * detection) and has not expired.
 */
export async function assertSessionActive(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId, isRevoked: false, expiresAt: { gt: new Date() } },
    select: { id: true },
  });

  if (!session) {
    throw new UnauthorizedError('Session is no longer active');
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No bearer token provided');
    }

    const payload = await verifyAccessToken(authHeader.slice(7));

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
