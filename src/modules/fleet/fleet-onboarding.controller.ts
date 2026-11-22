import { Request, Response, NextFunction } from 'express';
import {
  getOnboardingStatus,
  submitOnboarding,
  updateBankDetails,
  updateBusinessDetails,
  updateDocuments,
  updateLocationDetails,
} from './fleet-onboarding.service';
import { sendResponse } from '../../utils/sendResponse';

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
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Onboarding status retrieved successfully',
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
    const result = await updateBusinessDetails(
      req.user!.id,
      req.body as Parameters<typeof updateBusinessDetails>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Business details updated successfully',
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
    const result = await updateLocationDetails(
      req.user!.id,
      req.body as Parameters<typeof updateLocationDetails>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Location details updated successfully',
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
    const result = await updateBankDetails(
      req.user!.id,
      req.body as Parameters<typeof updateBankDetails>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Bank details updated successfully',
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
    const result = await updateDocuments(
      req.user!.id,
      req.body as Parameters<typeof updateDocuments>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Documents updated successfully',
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
    const result = await submitOnboarding(
      req.user!.id,
      req.body as Parameters<typeof submitOnboarding>[1],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Onboarding submitted for review',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
