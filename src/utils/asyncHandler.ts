import { Request, Response, NextFunction } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Async Handler Wrapper
//
// Wraps async route handlers so that any rejected promise is forwarded to
// Express's next(err) rather than causing an unhandled promise rejection crash.
//
// Usage: router.get('/path', asyncHandler(myAsyncController))
// ─────────────────────────────────────────────────────────────────────────────

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
