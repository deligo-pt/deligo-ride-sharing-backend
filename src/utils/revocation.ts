import { config } from '../config';
import { redis } from './redis';
import type { JwtPayload } from '../types/auth.types';

const TTL_SLACK_SECONDS = 60;
const FALLBACK_TTL_SECONDS = 30 * 60;

const userKey = (userId: string): string => `revoked:user:${userId}`;
const sessionKey = (sessionId: string): string => `revoked:session:${sessionId}`;

export function durationToSeconds(value: string): number | null {
  const match = /^(\d+)\s*(s|m|h|d|w)?$/i.exec(value.trim());
  if (!match) return null;
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 }[unit] ?? 1;
  return parseInt(match[1], 10) * multiplier;
}

export function maxAccessTokenTtlSeconds(): number {
  const lifetimes = [durationToSeconds(config.jwt.accessExpiresIn)];
  if (config.jwt.accessSecret !== config.jwt.secret) {
    lifetimes.push(durationToSeconds(config.jwt.expiresIn));
  }
  const max = Math.max(...lifetimes.filter((n): n is number => n !== null), 0);
  return (max || FALLBACK_TTL_SECONDS) + TTL_SLACK_SECONDS;
}

export async function revokeUserAccessTokens(userId: string): Promise<void> {
  await redis.set(userKey(userId), String(Date.now()), 'EX', maxAccessTokenTtlSeconds());
}

export async function revokeSessionAccessTokens(sessionId: string): Promise<void> {
  await redis.set(sessionKey(sessionId), String(Date.now()), 'EX', maxAccessTokenTtlSeconds());
}

export async function isAccessTokenRevoked(
  payload: Pick<JwtPayload, 'sub' | 'sessionId' | 'iat'>,
): Promise<boolean> {
  const keys = [userKey(payload.sub)];
  if (payload.sessionId) keys.push(sessionKey(payload.sessionId));

  const [userRevokedAt, sessionRevokedAt] = await redis.mget(keys);

  if (sessionRevokedAt) return true;

  if (userRevokedAt) {
    if (payload.iat === undefined) return true;
    return Number(userRevokedAt) >= payload.iat * 1000;
  }

  return false;
}
