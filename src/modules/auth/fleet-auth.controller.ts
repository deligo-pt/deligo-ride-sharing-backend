import { AuthService } from './auth.service';
import { InitiateSignupInput, LoginInput } from './auth.validation';
import { getClientInfo, setRefreshTokenCookie } from './auth.util';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Auth Controller
//
// Thin controller delegating to the shared AuthService with the explicit
// 'FLEET_MANAGER' role. The role is never accepted from the client request body.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/auth/fleet/signup/initiate — registration for the FLEET_MANAGER role. */
const initiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as InitiateSignupInput, 'FLEET_MANAGER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Fleet manager signup initiated. Verification code sent',
    data: result,
  });
});

/**
 * POST /api/v1/auth/fleet/login
 * Non-fleet-manager accounts are rejected with 403 after password verification.
 */
const login = catchAsync(async (req, res) => {
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

export const FleetAuthController = {
  initiateSignup,
  login,
};
