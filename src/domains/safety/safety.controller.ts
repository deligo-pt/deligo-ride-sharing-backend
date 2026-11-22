import { NextFunction, Request, Response } from 'express';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import { getActiveAlerts, resolveAlert, triggerSos } from './safety.service';
import { ResolveAlertSchema, TriggerSosSchema } from './safety.validation';
import { sendResponse } from '../../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Safety Controller  —  PRD 3.13 / 4.13
// ─────────────────────────────────────────────────────────────────────────────

function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    switch (err.message) {
      case 'USER_NOT_FOUND':
        return new NotFoundError('User');
      case 'ALERT_NOT_FOUND':
        return new NotFoundError('Emergency alert');
      case 'ALERT_ALREADY_RESOLVED':
        return new BadRequestError('This alert has already been resolved or dismissed.');
      case 'FORBIDDEN':
        return new ForbiddenError('You do not have permission to perform this action');
    }
  }
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/safety/sos
 * Role: CUSTOMER | DRIVER
 *
 * Triggers an SOS alert:
 *  - Creates an EmergencyAlert record (ACTIVE)
 *  - Updates the linked Ride to EMERGENCY (if rideId provided)
 *  - Broadcasts `sos_alert` to the `admin_security_desk` Socket.io room
 *  - Dispatches SMS to each of the initiator's emergency contacts
 */
export async function triggerSosHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = req.user!.role;
    if (role !== 'CUSTOMER' && role !== 'DRIVER') {
      throw new ForbiddenError('Only CUSTOMER or DRIVER roles can trigger an SOS');
    }

    const parsed = TriggerSosSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const result = await triggerSos(req.user!.id, role, parsed.data);

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'SOS alert triggered successfully',
      data: result,
    });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/safety/sos/:id/resolve
 * Role: ADMIN
 *
 * Allows an admin to mark an active alert as RESOLVED or FALSE_ALARM.
 * The linked ride is intentionally NOT auto-reset — admin handles it manually.
 */
export async function resolveAlertHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can resolve emergency alerts');
    }

    const alertId = req.params.id as string;
    if (!alertId) {
      throw new BadRequestError('Alert ID is required');
    }

    const parsed = ResolveAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const updatedAlert = await resolveAlert(alertId, req.user!.id, parsed.data);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Safety alert resolved successfully',
      data: { alert: updatedAlert },
    });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/safety/sos/active
 * Role: ADMIN
 *
 * Returns all currently ACTIVE EmergencyAlerts, newest first, with initiator details.
 */
export async function getActiveAlertsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can view active emergency alerts');
    }

    const alerts = await getActiveAlerts();

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Active safety alerts retrieved successfully',
      data: { alerts, total: alerts.length },
    });
  } catch (err) {
    next(mapError(err));
  }
}
