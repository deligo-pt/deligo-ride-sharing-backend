import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import { getReferralConfig, updateReferralConfig } from './admin.referrals.service';

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/v1/admin/referrals/config
// PATCH /api/v1/admin/referrals/config
// Role: ADMIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/referrals/config
 *
 * Returns the current referral campaign configuration (bonus amounts,
 * isActive flag). Auto-creates the singleton row with defaults on first call.
 */
export const getReferralConfigHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const config = await getReferralConfig();
    res.status(200).json(successResponse(config));
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/admin/referrals/config
 *
 * Partially update the referral campaign configuration.
 * Body fields (all optional, at least one required):
 *   referrerBonusAmount  — Float, positive
 *   refereeBonusAmount   — Float, positive
 *   isActive             — Boolean
 */
export const updateReferralConfigHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const updated = await updateReferralConfig(req.body);
    res.status(200).json(successResponse(updated));
  } catch (err) {
    next(err);
  }
};
