import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';
import { errorResponse } from '../types/api.types';

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
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.params) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
      }
      if (schemas.query) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        req.query = (await schemas.query.parseAsync(req.query)) as typeof req.query;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(422).json(
          errorResponse('Validation failed', 'VALIDATION_ERROR', err.flatten().fieldErrors),
        );
        return;
      }
      next(err);
    }
  };
}
