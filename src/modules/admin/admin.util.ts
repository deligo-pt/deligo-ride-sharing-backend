import { Request } from 'express';
import { ForbiddenError } from '../../utils/errors';

/** Role guard — rejects non-admin callers immediately. */
export function assertAdmin(req: Request): void {
  if (req.user?.role !== 'ADMIN') {
    throw new ForbiddenError('This action requires ADMIN privileges.');
  }
}
