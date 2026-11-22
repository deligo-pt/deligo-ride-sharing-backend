import { NextFunction, Request, Response } from 'express';
import { sendResponse } from '../../utils/sendResponse';
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

import { assertAdmin } from './admin.utils';

// ─── GET /api/v1/admin/kyc/pending ───────────────────────────────────────────

export const getPendingKycHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const profiles = await getPendingKycProfiles();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Pending KYC profiles retrieved successfully',
      data: { count: profiles.length, profiles },
    });
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
    const result = await reviewDriverKyc(
      driverProfileId,
      req.body as Parameters<typeof reviewDriverKyc>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Driver KYC reviewed successfully',
      data: result,
    });
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
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Users retrieved successfully',
      meta,
      data: { users },
    });
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
    const updated = await updateUserStatus(userId, req.body as Parameters<typeof updateUserStatus>[1]);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'User status updated successfully',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};
