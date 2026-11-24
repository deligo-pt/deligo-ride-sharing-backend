import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

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
      next(err);
    }
  };
}
