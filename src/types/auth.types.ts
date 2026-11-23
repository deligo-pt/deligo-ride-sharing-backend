import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email?: string | null;
  role: UserRole;
  sessionId?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: string;
  sessionId?: string;
  jti?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
