import crypto from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { redis } from '../utils/redis';
import { RateLimitError } from '../utils/errors';

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
  name: string;
  windowSeconds: number;
  max: number;
  keys?: (req: Request) => Array<string | undefined | null>;
  maxFor?: (index: number) => number;
  skip?: (req: Request) => boolean;
  message?: string;
}

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

const bodyString = (req: Request, field: string): string | undefined => {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[field];
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (field === 'contactNumber') return value.replace(/\D/g, '').replace(/^(00)?351(?=\d{9}$)/, '');
  if (field === 'email') return value.trim().toLowerCase();
  return value;
};

export const authRateLimiter: RequestHandler = createRateLimiter({
  name: 'auth',
  windowSeconds: 15 * 60,
  max: 10,
  keys: (req) => [
    `ip:${clientIp(req)}:${req.baseUrl}${req.path}`,
    ...['email', 'contactNumber', 'signupSessionId', 'token'].map((field) => {
      const value = bodyString(req, field);
      return value ? `id:${field}:${hashKey(value)}` : undefined;
    }),
  ],
  maxFor: (index) => (index === 0 ? 20 : 10),
  message: 'Too many attempts. Please try again in a few minutes.',
});

export const rideRateLimiter: RequestHandler = createRateLimiter({
  name: 'rides',
  windowSeconds: 60,
  max: 10,
  keys: (req) => [req.user ? `user:${req.user.id}` : `ip:${clientIp(req)}`],
  message: 'Too many ride requests. Please slow down.',
});

export const generalRateLimiter: RequestHandler = createRateLimiter({
  name: 'general',
  windowSeconds: 60,
  max: 120,
  keys: (req) => [`ip:${clientIp(req)}`],
  skip: (req) => req.path === '/' || req.method === 'OPTIONS',
});
