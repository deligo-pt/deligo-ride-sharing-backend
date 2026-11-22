import { Request, Response, NextFunction } from 'express';
import { initiateSignup, login } from '../auth.service';
import { InitiateSignupSchema, LoginSchema } from '../auth.validation';
import { getClientInfo, setRefreshTokenCookie } from '../auth.utils';
import { sendResponse } from '../../../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Driver Auth Controller
//
// Thin controller delegating to shared AuthService with explicit 'DRIVER' role.
// The role is never accepted from the client request body.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/driver/signup/initiate
 * Initiates registration specifically for DRIVER role.
 */
export async function driverInitiateSignupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = InitiateSignupSchema.parse(req.body);
    const result = await initiateSignup(validatedData, 'DRIVER');

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Driver signup initiated. Verification code sent',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/driver/login
 * Authenticates specifically for DRIVER role.
 * Non-driver accounts will be rejected with 403 Forbidden after password verification.
 */
export async function driverLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await login(validatedData, clientInfo, ['DRIVER']);

    const cookieDays = validatedData.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Driver login successful',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
