import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { LoginInput } from './auth.validation';
import { CreateAdminInput, SetAdminPasswordInput } from './admin-auth.validation';
import { getClientInfo, setRefreshTokenCookie } from './auth.util';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Auth Controller
//
// Login delegates to the shared AuthService with the explicit 'ADMIN' role;
// invitation and password setup use AdminAuthService.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/admin/login
 * Non-admin accounts are rejected with 403 after password verification.
 */
const login = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['ADMIN']);

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin login successful',
    data: result,
  });
});

/** POST /api/v1/auth/admin/create — ADMIN / SUPER_ADMIN invites a new administrator. */
const createAdmin = catchAsync(async (req, res) => {
  const creator = { id: req.user!.id, role: req.user!.role };
  const result = await AdminAuthService.createAdmin(req.body as CreateAdminInput, creator);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Admin invitation sent successfully',
    data: result,
  });
});

/** POST /api/v1/auth/admin/set-password — public; uses the one-time invitation token. */
const setAdminPassword = catchAsync(async (req, res) => {
  const result = await AdminAuthService.setAdminPassword(req.body as SetAdminPasswordInput);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin password set successfully',
    data: result,
  });
});

export const AdminAuthController = {
  login,
  createAdmin,
  setAdminPassword,
};
