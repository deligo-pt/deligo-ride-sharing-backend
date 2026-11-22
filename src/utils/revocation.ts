import { config } from '../config';
import { redis } from './redis';
import type { JwtPayload } from '../types/auth.types';

// ─────────────────────────────────────────────────────────────────────────────
// Instant access-token revocation (Redis)
//
// Access tokens are stateless JWTs, so a suspended user or a logged-out session
// would otherwise stay valid until the token expires. Two small marker keys make
// revocation take effect on the very next request:
//
//   revoked:user:<userId>        value = Date.now() when the user's tokens were revoked
//   revoked:session:<sessionId>  value = Date.now() when that one session was revoked
//
// A token is rejected when its session key exists, or when the user key holds a
// timestamp >= the token's `iat` (so tokens issued AFTER the revocation — e.g. a
// fresh login once the account is re-activated — keep working).
//
// Memory safety: every key has a TTL equal to the longest possible access-token
// lifetime. After that no token that predates the revocation can still be valid,
// so the key is useless and Redis drops it.
// ─────────────────────────────────────────────────────────────────────────────

const TTL_SLACK_SECONDS = 60; // clock-skew / in-flight safety margin
const FALLBACK_TTL_SECONDS = 30 * 60;

const userKey = (userId: string): string => `revoked:user:${userId}`;
const sessionKey = (sessionId: string): string => `revoked:session:${sessionId}`;

/** Parses a jsonwebtoken-style duration ("900", "15m", "12h", "7d") into seconds. */
export function durationToSeconds(value: string): number | null {
  const match = /^(\d+)\s*(s|m|h|d|w)?$/i.exec(value.trim());
  if (!match) return null;
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 }[unit] ?? 1;
  return parseInt(match[1], 10) * multiplier;
}

/**
 * Longest an access token accepted by verifyAccessToken() can live. Legacy tokens
 * signed with JWT_SECRET (accepted as a fallback when JWT_ACCESS_SECRET is set)
 * use JWT_EXPIRES_IN, so that lifetime is included in that case.
 */
export function maxAccessTokenTtlSeconds(): number {
  const lifetimes = [durationToSeconds(config.jwt.accessExpiresIn)];
  if (config.jwt.accessSecret !== config.jwt.secret) {
    lifetimes.push(durationToSeconds(config.jwt.expiresIn));
  }
  const max = Math.max(...lifetimes.filter((n): n is number => n !== null), 0);
  return (max || FALLBACK_TTL_SECONDS) + TTL_SLACK_SECONDS;
}

/** Marks every access token issued to this user up to now as revoked. */
export async function revokeUserAccessTokens(userId: string): Promise<void> {
  await redis.set(userKey(userId), String(Date.now()), 'EX', maxAccessTokenTtlSeconds());
}

/** Marks every access token of one login session as revoked. */
export async function revokeSessionAccessTokens(sessionId: string): Promise<void> {
  await redis.set(sessionKey(sessionId), String(Date.now()), 'EX', maxAccessTokenTtlSeconds());
}

/** True if the token's user or session has been revoked since the token was issued. */
export async function isAccessTokenRevoked(
  payload: Pick<JwtPayload, 'sub' | 'sessionId' | 'iat'>,
): Promise<boolean> {
  const keys = [userKey(payload.sub)];
  if (payload.sessionId) keys.push(sessionKey(payload.sessionId));

  // One round trip for both lookups.
  const [userRevokedAt, sessionRevokedAt] = await redis.mget(keys);

  if (sessionRevokedAt) return true;

  if (userRevokedAt) {
    // A token without `iat` cannot be proven newer than the revocation → reject.
    if (payload.iat === undefined) return true;
    return Number(userRevokedAt) >= payload.iat * 1000;
  }

  return false;
}
