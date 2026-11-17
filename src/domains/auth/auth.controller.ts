import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import {
  initiateSignup,
  resendSignupOtp,
  verifySignupOtp,
  login,
  refreshAccessToken,
  logoutUser,
  ClientInfo,
} from './auth.service';
import {
  InitiateSignupSchema,
  ResendOtpSchema,
  VerifyOtpSchema,
  LoginSchema,
  RefreshTokenSchema,
} from './auth.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller
// ─────────────────────────────────────────────────────────────────────────────

function getClientInfo(req: Request): ClientInfo {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]?.trim()
      : req.ip || req.socket.remoteAddress;

  return {
    userAgent: req.headers['user-agent'],
    ipAddress,
  };
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.split('=');
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    list[trimmedName] = decodeURIComponent(rest.join('=').trim());
  });

  return list;
}

function setRefreshTokenCookie(res: Response, token: string, maxAgeDays = 30): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  });
}

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
    const result = await initiateSignup(validatedData);

    res.status(200).json({
      success: true,
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

    res.status(200).json({
      success: true,
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

    res.status(201).json({
      success: true,
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
    const result = await login(validatedData, clientInfo);

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
 * POST /api/v1/auth/refresh-token
 */
export async function refreshTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const validatedBody = RefreshTokenSchema.parse(req.body);

    const token = validatedBody.refreshToken || cookies['refreshToken'];

    const tokens = await refreshAccessToken(token || '');

    setRefreshTokenCookie(res, tokens.refreshToken, 30);

    res.status(200).json({
      success: true,
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
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = (req.body?.refreshToken as string | undefined) || cookies['refreshToken'];

    // If authenticated via Bearer token:
    const sessionId = req.user?.sessionId;
    const jti = req.user?.jti;

    // Optional decode if jti was not set on req.user (e.g. if logout called without auth middleware or with expired header)
    const result = await logoutUser({
      sessionId,
      jti,
      refreshToken,
    });

    res.clearCookie('refreshToken', {
      path: '/api/v1/auth',
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
