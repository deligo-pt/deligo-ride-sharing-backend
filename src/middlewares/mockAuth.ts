import { Request, Response, NextFunction } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Authentication Middleware
//
// Simulates an authenticated user by reading identity headers injected by
// the caller (Postman, tests, or a future API gateway). This replaces JWT
// verification while the real auth microservice is being built separately.
//
// Required headers:
//   x-mock-user-id   — the user's UUID (maps to CustomerProfile.userId)
//   x-mock-role      — one of CUSTOMER | DRIVER | ADMIN
// ─────────────────────────────────────────────────────────────────────────────

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const mockUserId = req.header('x-mock-user-id');
  const mockUserRole = req.header('x-mock-role');

  if (!mockUserId || !mockUserRole) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing mock headers. Provide x-mock-user-id and x-mock-role',
      },
    });
    return;
  }

  req.user = { id: mockUserId, role: mockUserRole };
  next();
};
