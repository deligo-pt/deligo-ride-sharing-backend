import { Request, Response, NextFunction } from 'express';
import {
  initiateSignup,
  resendSignupOtp,
  verifySignupOtp,
  login,
  googleLogin,
  facebookLogin,
  appleLogin,
  refreshAccessToken,
  logoutUser,
} from './auth.service';
import {
  InitiateSignupSchema,
  ResendOtpSchema,
  VerifyOtpSchema,
  LoginSchema,
  GoogleLoginSchema,
  FacebookLoginSchema,
  AppleLoginSchema,
  RefreshTokenSchema,
} from './auth.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller
// ─────────────────────────────────────────────────────────────────────────────

import {
  getClientInfo,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from './auth.util';
import { sendResponse } from '../../utils/sendResponse';

export {
  getClientInfo,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
};

/**
 * POST /api/v1/auth/signup/initiate
 */
export async function initiateSignupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = InitiateSignupSchema.parse(req.body);
    const result = await initiateSignup(validatedData, 'CUSTOMER');

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Signup initiated. Verification code sent',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/signup/resend-otp
 */
export async function resendOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = ResendOtpSchema.parse(req.body);
    const result = await resendSignupOtp(validatedData);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Verification code resent successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/signup/verify-otp
 */
export async function verifyOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = VerifyOtpSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await verifySignupOtp(validatedData, clientInfo);

    setRefreshTokenCookie(res, result.tokens.refreshToken, 1);

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Account verified and created successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/login
 */
export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await login(validatedData, clientInfo, ['CUSTOMER']);

    const cookieDays = validatedData.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/google
 */
export async function googleLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = GoogleLoginSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await googleLogin(validatedData, clientInfo);

    const cookieDays = validatedData.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Google login successful',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/facebook
 */
export async function facebookLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = FacebookLoginSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await facebookLogin(validatedData, clientInfo);

    const cookieDays = validatedData.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Facebook login successful',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/apple
 */
export async function appleLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = AppleLoginSchema.parse(req.body);
    const clientInfo = getClientInfo(req);
    const result = await appleLogin(validatedData, clientInfo);

    const cookieDays = validatedData.rememberMe ? 30 : 1;
    setRefreshTokenCookie(res, result.tokens.refreshToken, cookieDays);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Apple login successful',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/refresh-token
 * Accepts refresh token from either JSON body (mobile clients) or httpOnly cookie (web clients).
 */
export async function refreshTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    // Fallback to empty object so cookie-only requests without a JSON body do not fail Zod parsing
    const validatedBody = RefreshTokenSchema.parse(req.body || {});
    const token = validatedBody.refreshToken || cookies[REFRESH_COOKIE_NAME];

    const { tokens, rememberMe } = await refreshAccessToken(token || '');

    // Preserve the session's original rememberMe duration (30 days vs 1 day)
    setRefreshTokenCookie(res, tokens.refreshToken, rememberMe ? 30 : 1);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Token refreshed successfully',
      data: { tokens },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 */
export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const body = (req.body ?? {}) as { refreshToken?: string };
    const refreshToken = body.refreshToken || cookies[REFRESH_COOKIE_NAME];

    // If authenticated via Bearer token, forward sessionId and jti for revocation & blacklisting
    const sessionId = req.user?.sessionId;
    const jti = req.user?.jti;

    const result = await logoutUser({
      sessionId,
      jti,
      refreshToken,
    });

    clearRefreshTokenCookie(res);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Logged out successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
