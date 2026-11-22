import crypto from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { redis } from '../utils/redis';
import { RateLimitError } from '../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Redis-backed fixed-window rate limiter
//
// One atomic Lua script does INCR + PEXPIRE (on the first hit of a window) and
// returns the counter and remaining TTL, so there is no INCR/EXPIRE race that
// could leave a counter without an expiry. Counters are shared by every API
// instance, and every key expires with its window, so Redis memory stays bounded.
//
// Over the limit → `429` + `Retry-After`, delivered through the global
// errorHandler (RateLimitError) like every other error.
//
// If Redis is unreachable the limiter FAILS OPEN (logs and lets the request
// through) so a Redis outage cannot take the whole API down.
// ─────────────────────────────────────────────────────────────────────────────

const INCR_WITH_TTL_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export interface RateLimitOptions {
  /** Bucket namespace, e.g. "auth". Part of the Redis key. */
  name: string;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Max requests per key within the window. */
  max: number;
  /**
   * Identities to limit. Each returned value gets its own counter and ANY of them
   * exceeding `max` blocks the request. Falsy entries are ignored.
   * Defaults to the client IP.
   */
  keys?: (req: Request) => Array<string | undefined | null>;
  /** Override the per-key limit for specific keys (e.g. a looser IP cap). */
  maxFor?: (index: number) => number;
  /** Return true to bypass the limiter for this request. */
  skip?: (req: Request) => boolean;
  /** Message returned with the 429. */
  message?: string;
}

/** Hash identifiers (emails, phones, tokens) so no PII/secrets sit in Redis keys. */
export const hashKey = (value: string): string =>
  crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);

const clientIp = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { name, windowSeconds, max, keys, maxFor, skip, message } = options;
  const windowMs = windowSeconds * 1000;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip?.(req)) {
      next();
      return;
    }

    const identities = (keys ? keys(req) : [`ip:${clientIp(req)}`]).filter((k): k is string =>
      Boolean(k),
    );
    if (identities.length === 0) {
      next();
      return;
    }

    void (async () => {
      let worst: { remaining: number; resetMs: number; blocked: boolean } = {
        remaining: Infinity,
        resetMs: 0,
        blocked: false,
      };

      try {
        const results = await Promise.all(
          identities.map(async (id, index) => {
            const [count, ttl] = (await redis.eval(
              INCR_WITH_TTL_LUA,
              1,
              `rl:${name}:${id}`,
              String(windowMs),
            )) as [number, number];
            const limit = maxFor ? maxFor(index) : max;
            return { limit, count, ttl };
          }),
        );

        for (const { limit, count, ttl } of results) {
          const remaining = Math.max(0, limit - count);
          if (count > limit) {
            worst = { remaining: 0, resetMs: Math.max(worst.resetMs, ttl), blocked: true };
          } else if (!worst.blocked && remaining < worst.remaining) {
            worst = { remaining, resetMs: ttl, blocked: false };
          }
        }
      } catch (err) {
        console.error(`[RATE-LIMIT:${name}] Redis error — failing open:`, err);
        next();
        return;
      }

      const resetSeconds = Math.max(1, Math.ceil(worst.resetMs / 1000));
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader(
        'RateLimit-Remaining',
        String(worst.remaining === Infinity ? max : worst.remaining),
      );
      res.setHeader('RateLimit-Reset', String(resetSeconds));

      if (worst.blocked) {
        res.setHeader('Retry-After', String(resetSeconds));
        next(new RateLimitError(message ?? 'Too many requests, please try again later'));
        return;
      }

      next();
    })();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiers
// ─────────────────────────────────────────────────────────────────────────────

const bodyString = (req: Request, field: string): string | undefined => {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[field];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

/**
 * Strict tier — login, signup, OTP send/verify, social login, admin set-password.
 * 10 attempts / 15 min per account identifier (email, phone, signup session or
 * invite token) and 20 / 15 min per IP. The IP cap is looser so many legitimate
 * users behind one carrier/office NAT aren't locked out, while still stopping
 * credential stuffing and OTP flooding from a single address.
 */
export const authRateLimiter: RequestHandler = createRateLimiter({
  name: 'auth',
  windowSeconds: 15 * 60,
  max: 10,
  keys: (req) => [
    `ip:${clientIp(req)}:${req.baseUrl}${req.path}`,
    ...['email', 'phone', 'signupSessionId', 'token'].map((field) => {
      const value = bodyString(req, field);
      return value ? `id:${field}:${hashKey(value)}` : undefined;
    }),
  ],
  maxFor: (index) => (index === 0 ? 20 : 10),
  message: 'Too many attempts. Please try again in a few minutes.',
});

/** Ride tier — ride request / fare estimate. 10 requests / minute per user. */
export const rideRateLimiter: RequestHandler = createRateLimiter({
  name: 'rides',
  windowSeconds: 60,
  max: 10,
  keys: (req) => [req.user ? `user:${req.user.id}` : `ip:${clientIp(req)}`],
  message: 'Too many ride requests. Please slow down.',
});

/** General tier — everything under /api/v1. 120 requests / minute per IP. */
export const generalRateLimiter: RequestHandler = createRateLimiter({
  name: 'general',
  windowSeconds: 60,
  max: 120,
  keys: (req) => [`ip:${clientIp(req)}`],
  // The API root doubles as a liveness probe; /health lives outside /api/v1.
  skip: (req) => req.path === '/' || req.method === 'OPTIONS',
});
