import { Request, Response, NextFunction } from 'express';
import {
  getOnboardingStatus,
  submitOnboarding,
  updateBankDetails,
  updateBusinessDetails,
  updateDocuments,
  updateLocationDetails,
} from './fleetOnboarding.service';

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Manager Onboarding Controller
// ─────────────────────────────────────────────────────────────────────────────

export async function getOnboardingStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getOnboardingStatus(req.user!.id);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBusinessDetailsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await updateBusinessDetails(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateLocationDetailsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await updateLocationDetails(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBankDetailsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await updateBankDetails(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDocumentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await updateDocuments(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function submitOnboardingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await submitOnboarding(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
