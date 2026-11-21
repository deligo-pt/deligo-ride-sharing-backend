import { Request, Response } from 'express';
import { config } from '../../config';
import { ClientInfo } from './auth.service';

export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Extracts client User-Agent and IP address from the incoming request.
 * Note: Ensure Express `app.set('trust proxy', ...)` is configured properly in production
 * so `req.ip` reflects the real client IP without trusting spoofable headers blindly.
 */
export function getClientInfo(req: Request): ClientInfo {
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

/**
 * Sets the httpOnly refresh token cookie with consistent security attributes.
 */
export function setRefreshTokenCookie(res: Response, token: string, maxAgeDays = 1): void {
  const isSecure = config.sameSiteCookie === 'none' ? true : config.isProduction;
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: config.sameSiteCookie,
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clears the refresh token cookie using the exact same attributes used when setting it,
 * ensuring all browsers reliably remove the cookie.
 */
export function clearRefreshTokenCookie(res: Response): void {
  const isSecure = config.sameSiteCookie === 'none' ? true : config.isProduction;
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: config.sameSiteCookie,
    path: REFRESH_COOKIE_PATH,
  });
}
