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
  email?: string; // optional — not available in mock auth context
  role: string; // string (not enum) so mock headers work without enum casting
  sessionId?: string;
  jti?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
