import { Request, Response } from 'express';
import { config } from '../../config';
import type { AuthTokens, ClientInfo } from './auth.interface';
import {
  MOBILE_PLATFORMS,
  NATIVE_APP_USER_AGENT,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from './auth.constant';

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

export function clearRefreshTokenCookie(res: Response): void {
  const isSecure = config.sameSiteCookie === 'none' ? true : config.isProduction;
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: config.sameSiteCookie,
    path: REFRESH_COOKIE_PATH,
  });
}

export function isMobileClient(req: Request): boolean {
  const header = req.headers['x-client-platform'] ?? req.headers['x-platform'];
  const platform = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
  if (platform) return MOBILE_PLATFORMS.has(platform);

  const body = req.body as { includeRefreshToken?: unknown } | undefined;
  if (body?.includeRefreshToken === true) return true;

  return NATIVE_APP_USER_AGENT.test(req.headers['user-agent'] ?? '');
}

export function tokensForClient(
  req: Request,
  tokens: AuthTokens,
): { accessToken: string; expiresIn: number; refreshToken?: string } {
  return isMobileClient(req)
    ? {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      }
    : { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
}
