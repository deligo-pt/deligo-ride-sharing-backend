import { Request, Response, NextFunction } from 'express';
import { login } from '../auth.service';
import { LoginSchema } from '../auth.validation';
import { getClientInfo, setRefreshTokenCookie } from '../auth.utils';
import { createAdmin, setAdminPassword } from './adminAuth.service';
import { CreateAdminSchema, SetAdminPasswordSchema } from './adminAuth.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Auth Controller
//
// Thin controller delegating to shared AuthService with explicit 'ADMIN' role,
// and AdminAuthService for creation and password setup.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/admin/login
 * Authenticates specifically for ADMIN role.
 * Non-admin accounts will be rejected with 403 Forbidden after password verification.
 */
export async function adminLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await login(validatedData, clientInfo, ['ADMIN']);

    const cookieDays = validatedData.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/admin/create
 * Authenticated ADMIN / SUPER_ADMIN endpoint to invite a new administrator.
 */
export async function createAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = CreateAdminSchema.parse(req.body);
    const creator = { id: req.user!.id, role: req.user!.role };
    const result = await createAdmin(validatedData, creator);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/admin/set-password
 * Public endpoint to set admin password using one-time token from invitation link.
 */
export async function setAdminPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = SetAdminPasswordSchema.parse(req.body);
    const result = await setAdminPassword(validatedData);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
