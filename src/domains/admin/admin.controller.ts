import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../types/api.types';
import { ForbiddenError } from '../../utils/errors';
import {
  getPendingKycProfiles,
  reviewDriverKyc,
  listUsers,
  updateUserStatus,
} from './admin.service';

// ─────────────────────────────────────────────────────────────────────────────
// Admin Controller  —  PRD 5.x
//
// Each handler:
//  1. Verifies the caller is an ADMIN (role guard).
//  2. Delegates business logic to the service layer.
//  3. Returns a standardized JSON response.
// ─────────────────────────────────────────────────────────────────────────────

/** Role guard — rejects non-admin callers immediately. */
function assertAdmin(req: Request): void {
  if (req.user?.role !== 'ADMIN') {
    throw new ForbiddenError('This action requires ADMIN privileges.');
  }
}

// ─── GET /api/v1/admin/kyc/pending ───────────────────────────────────────────

export const getPendingKycHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const profiles = await getPendingKycProfiles();
    res.status(200).json(
      successResponse({
        count: profiles.length,
        profiles,
      }),
    );
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/v1/admin/kyc/:driverProfileId ────────────────────────────────

export const reviewKycHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const driverProfileId = req.params.driverProfileId as string;
    const result = await reviewDriverKyc(driverProfileId, req.body);
    res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/v1/admin/users ─────────────────────────────────────────────────

export const listUsersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const { users, meta } = await listUsers(req.query as never);
    res.status(200).json(successResponse({ users }, meta));
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/v1/admin/users/:userId/status ────────────────────────────────

export const updateUserStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const userId = req.params.userId as string;
    const updated = await updateUserStatus(userId, req.body);
    res.status(200).json(successResponse(updated));
  } catch (err) {
    next(err);
  }
};
