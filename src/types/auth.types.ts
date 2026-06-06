import { UserRole } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// JWT Payload — stored inside the token
// ─────────────────────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;      // User ID
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Express Request Augmentation
// Adds the authenticated user context to every protected request
// ─────────────────────────────────────────────────────────────────────────────
export interface AuthenticatedUser {
  id: string;
  email?: string;    // optional — not available in mock auth context
  role: string;      // string (not enum) so mock headers work without enum casting
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
