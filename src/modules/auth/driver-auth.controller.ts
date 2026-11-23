import { AuthService } from './auth.service';
import { InitiateSignupInput, LoginInput } from './auth.validation';
import { getClientInfo, setRefreshTokenCookie } from './auth.util';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Driver Auth Controller
//
// Thin controller delegating to the shared AuthService with the explicit
// 'DRIVER' role. The role is never accepted from the client request body.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/auth/driver/signup/initiate — registration for the DRIVER role. */
const initiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as InitiateSignupInput, 'DRIVER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Driver signup initiated. Verification code sent',
    data: result,
  });
});

/**
 * POST /api/v1/auth/driver/login
 * Non-driver accounts are rejected with 403 after password verification.
 */
const login = catchAsync(async (req, res) => {
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

export const DriverAuthController = {
  initiateSignup,
  login,
};
