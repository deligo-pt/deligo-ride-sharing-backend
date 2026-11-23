import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Validation Middleware Factory
//
// Validates req.body, req.params, and req.query against a Zod schema.
// On failure, returns a 422 with field-level error details.
// Accepts either a fixed set of schemas or a resolver `(req) => schemas` for
// request-dependent validation (e.g. role-specific bodies).
// On success, replaces req.body/params/query with the parsed (coerced) data.
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationTargets {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validateRequest(
  schemas: ValidationTargets | ((req: Request) => ValidationTargets),
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const targets = typeof schemas === 'function' ? schemas(req) : schemas;
      if (targets.body) {
        req.body = await targets.body.parseAsync(req.body);
      }
      if (targets.params) {
        Object.defineProperty(req, 'params', {
          value: await targets.params.parseAsync(req.params),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      if (targets.query) {
        Object.defineProperty(req, 'query', {
          value: await targets.query.parseAsync(req.query),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      next();
    } catch (err) {
      // ZodError is mapped to a 422 by the global errorHandler.
      next(err);
    }
  };
}
