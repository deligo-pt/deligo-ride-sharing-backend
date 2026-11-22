import { UserRole } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// JWT Payload — stored inside the token
// ─────────────────────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string; // User ID
  email?: string | null;
  role: UserRole;
  sessionId?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Express Request Augmentation
// Adds the authenticated user context to every protected request
// ─────────────────────────────────────────────────────────────────────────────
export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: string; // string (not enum): requireRole() may widen it to 'SUPER_ADMIN'
  sessionId?: string;
  jti?: string;
}

declare global {
  // Augmenting Express.Request requires a namespace declaration.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
