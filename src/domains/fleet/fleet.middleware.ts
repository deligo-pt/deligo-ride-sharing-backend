import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/db';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Operational Guard Middleware
//
// Ensures the authenticated user is a FLEET_MANAGER and that their FleetManagerProfile
// exists, is not soft-deleted, and has achieved APPROVED verification status.
// ─────────────────────────────────────────────────────────────────────────────

export async function requireApprovedFleet(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (req.user.role !== 'FLEET_MANAGER') {
      throw new ForbiddenError('Access denied. Required role: FLEET_MANAGER');
    }

    const profile = await prisma.fleetManagerProfile.findUnique({
      where: { userId: req.user.id },
      select: { verificationStatus: true, isDeleted: true },
    });

    if (
      !profile ||
      profile.isDeleted ||
      profile.verificationStatus !== 'APPROVED'
    ) {
      throw new ForbiddenError(
        'Your Fleet Manager account must be approved to perform this action',
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
