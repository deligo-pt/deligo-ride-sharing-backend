import { Request, Response, NextFunction } from 'express';
import { initiateSignup, login } from './auth.service';
import { InitiateSignupInput, LoginInput } from './auth.validation';
import { getClientInfo, setRefreshTokenCookie } from './auth.util';
import { sendResponse } from '../../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Auth Controller
//
// Thin controller delegating to shared AuthService with explicit 'FLEET_MANAGER' role.
// The role is never accepted from the client request body.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/fleet/signup/initiate
 * Initiates registration specifically for FLEET_MANAGER role.
 */
export async function fleetInitiateSignupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as InitiateSignupInput;
    const result = await initiateSignup(input, 'FLEET_MANAGER');

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Fleet manager signup initiated. Verification code sent',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/fleet/login
 * Authenticates specifically for FLEET_MANAGER role.
 * Non-fleet manager accounts will be rejected with 403 Forbidden after password verification.
 */
export async function fleetLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as LoginInput;
    const clientInfo = getClientInfo(req);
    const result = await login(input, clientInfo, ['FLEET_MANAGER']);

    const cookieDays = input.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Fleet manager login successful',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
