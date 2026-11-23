import { AuthService } from './auth.service';
import {
  AppleLoginInput,
  CreateAdminInput,
  FacebookLoginInput,
  GoogleLoginInput,
  InitiateSignupInput,
  LoginInput,
  RefreshTokenInput,
  ResendOtpInput,
  SetAdminPasswordInput,
  VerifyOtpInput,
} from './auth.validation';
import {
  clearRefreshTokenCookie,
  getClientInfo,
  REFRESH_COOKIE_NAME,
  setRefreshTokenCookie,
} from './auth.util';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller  (customer + shared session endpoints)
// Request validation lives in auth.validation.ts and runs in auth.route.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/auth/signup/initiate */
const initiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as InitiateSignupInput, 'CUSTOMER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Signup initiated. Verification code sent',
    data: result,
  });
});

/** POST /api/v1/auth/signup/resend-otp */
const resendOtp = catchAsync(async (req, res) => {
  const result = await AuthService.resendSignupOtp(req.body as ResendOtpInput);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code resent successfully',
    data: result,
  });
});

/** POST /api/v1/auth/signup/verify-otp */
const verifyOtp = catchAsync(async (req, res) => {
  const result = await AuthService.verifySignupOtp(req.body as VerifyOtpInput, getClientInfo(req));

  setRefreshTokenCookie(res, result.tokens.refreshToken, 1);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Account verified and created successfully',
    data: result,
  });
});

/** POST /api/v1/auth/login */
const login = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['CUSTOMER']);

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Login successful',
    data: result,
  });
});

/** POST /api/v1/auth/google */
const googleLogin = catchAsync(async (req, res) => {
  const input = req.body as GoogleLoginInput;
  const result = await AuthService.googleLogin(input, getClientInfo(req));

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Google login successful',
    data: result,
  });
});

/** POST /api/v1/auth/facebook */
const facebookLogin = catchAsync(async (req, res) => {
  const input = req.body as FacebookLoginInput;
  const result = await AuthService.facebookLogin(input, getClientInfo(req));

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Facebook login successful',
    data: result,
  });
});

/** POST /api/v1/auth/apple */
const appleLogin = catchAsync(async (req, res) => {
  const input = req.body as AppleLoginInput;
  const result = await AuthService.appleLogin(input, getClientInfo(req));

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Apple login successful',
    data: result,
  });
});

/**
 * POST /api/v1/auth/refresh-token
 * Accepts the refresh token from the JSON body (mobile) or the httpOnly cookie (web).
 */
const refreshToken = catchAsync(async (req, res) => {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const body = req.body as RefreshTokenInput;
  const token = body.refreshToken || cookies[REFRESH_COOKIE_NAME];

  const { tokens, rememberMe } = await AuthService.refreshAccessToken(token || '');

  // Preserve the session's original rememberMe duration (30 days vs 1 day)
  setRefreshTokenCookie(res, tokens.refreshToken, rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Token refreshed successfully',
    data: { tokens },
  });
});

/** POST /api/v1/auth/logout — works with a Bearer token, a refresh token body, or the cookie. */
const logout = catchAsync(async (req, res) => {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const body = (req.body ?? {}) as { refreshToken?: string };

  const result = await AuthService.logoutUser({
    // If authenticated via Bearer token, forward sessionId and jti for revocation & blacklisting
    sessionId: req.user?.sessionId,
    jti: req.user?.jti,
    refreshToken: body.refreshToken || cookies[REFRESH_COOKIE_NAME],
  });

  clearRefreshTokenCookie(res);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged out successfully',
    data: result,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Role-specific entry points. The role is fixed server-side — never read from the body.
// Non-matching accounts are rejected with 403 after password verification.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/auth/driver/signup/initiate — registration for the DRIVER role. */
const driverInitiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as InitiateSignupInput, 'DRIVER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver signup initiated. Verification code sent',
    data: result,
  });
});

/** POST /api/v1/auth/driver/login */
const driverLogin = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['DRIVER']);

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver login successful',
    data: result,
  });
});

/** POST /api/v1/auth/fleet/signup/initiate — registration for the FLEET_MANAGER role. */
const fleetInitiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as InitiateSignupInput, 'FLEET_MANAGER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fleet manager signup initiated. Verification code sent',
    data: result,
  });
});

/** POST /api/v1/auth/fleet/login */
const fleetLogin = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['FLEET_MANAGER']);

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fleet manager login successful',
    data: result,
  });
});

/** POST /api/v1/auth/admin/login */
const adminLogin = catchAsync(async (req, res) => {
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
  const result = await AuthService.createAdmin(req.body as CreateAdminInput, creator);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Admin invitation sent successfully',
    data: result,
  });
});

/** POST /api/v1/auth/admin/set-password — public; uses the one-time invitation token. */
const setAdminPassword = catchAsync(async (req, res) => {
  const result = await AuthService.setAdminPassword(req.body as SetAdminPasswordInput);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin password set successfully',
    data: result,
  });
});

export const AuthController = {
  initiateSignup,
  resendOtp,
  verifyOtp,
  login,
  googleLogin,
  facebookLogin,
  appleLogin,
  refreshToken,
  logout,
  driverInitiateSignup,
  driverLogin,
  fleetInitiateSignup,
  fleetLogin,
  adminLogin,
  createAdmin,
  setAdminPassword,
};
