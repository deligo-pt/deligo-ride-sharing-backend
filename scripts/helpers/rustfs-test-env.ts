// Test-only env, loaded before src/config/env.ts validates process.env.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
process.env.JWT_SECRET ??= 'test_jwt_secret_that_is_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_that_is_at_least_32_chars';
process.env.RUSTFS_ENDPOINT = 'http://rustfs.test:9000';
process.env.RUSTFS_ACCESS_KEY = 'ak';
process.env.RUSTFS_SECRET_KEY = 'sk';
process.env.RUSTFS_BUCKET = 'deligo-ride-sharing';
process.env.RUSTFS_PUBLIC_URL = '';
process.env.UPLOAD_ALLOWED_URL_HOSTS = 'cdn.example.com';

// Stub the Redis/DB-backed middlewares so upload routes can be exercised without infrastructure.
import { UnauthorizedError } from '../../src/utils/errors';

const stub = (modulePath: string, exports: Record<string, unknown>): void => {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports } as unknown as NodeJS.Module;
};

stub('../../src/middlewares/auth', {
  // Any request with an Authorization header is "user-1"; otherwise 401.
  authenticate: (
    req: { headers: Record<string, string | undefined>; user?: unknown },
    _res: unknown,
    next: (err?: unknown) => void,
  ): void => {
    if (!req.headers.authorization) return next(new UnauthorizedError());
    req.user = { id: 'user-1', role: 'DRIVER' };
    next();
  },
});
stub('../../src/middlewares/rateLimiter', {
  uploadRateLimiter: (_req: unknown, _res: unknown, next: () => void): void => next(),
});
stub('../../src/utils/errorLogger', {
  shouldPersistError: (): boolean => false,
  persistErrorLog: (): void => undefined,
});
