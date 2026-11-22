import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Validation Middleware Factory
//
// Validates req.body, req.params, and req.query against a Zod schema.
// On failure, returns a 422 with field-level error details.
// On success, replaces req.body/params/query with the parsed (coerced) data.
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationTargets {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schemas: ValidationTargets) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.params) {
        Object.defineProperty(req, 'params', {
          value: await schemas.params.parseAsync(req.params),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      if (schemas.query) {
        Object.defineProperty(req, 'query', {
          value: await schemas.query.parseAsync(req.query),
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
