import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so a rejected promise is forwarded to the global
 * error handler via next(err) — controllers never need their own try/catch.
 */
export const catchAsync =
  (fn: RequestHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
