import { SafetyService } from './safety.service';
import { ResolveAlertDto, TriggerSosDto } from './safety.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

// ─────────────────────────────────────────────────────────────────────────────
// Safety Controller  —  PRD 3.13 / 4.13
// Role checks live in safety.route.ts (authorize); validation in safety.validation.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/safety/sos
 * Role: CUSTOMER | DRIVER
 *
 * Triggers an SOS alert: creates an ACTIVE EmergencyAlert, escalates the linked
 * ride to EMERGENCY, broadcasts `sos_alert` to `admin_security_desk`, and SMSes
 * the initiator's emergency contacts.
 */
const triggerSos = catchAsync(async (req, res) => {
  const result = await SafetyService.triggerSos(
    req.user!.id,
    req.user!.role,
    req.body as TriggerSosDto,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'SOS alert triggered successfully',
    data: result,
  });
});

/**
 * PATCH /api/v1/safety/sos/:id/resolve
 * Role: ADMIN
 *
 * Marks an active alert RESOLVED or FALSE_ALARM. The linked ride is
 * intentionally NOT auto-reset — admin handles it manually.
 */
const resolveAlert = catchAsync(async (req, res) => {
  const updatedAlert = await SafetyService.resolveAlert(
    req.params.id as string,
    req.user!.id,
    req.body as ResolveAlertDto,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Safety alert resolved successfully',
    data: { alert: updatedAlert },
  });
});

/**
 * GET /api/v1/safety/sos/active
 * Role: ADMIN — all ACTIVE EmergencyAlerts, newest first, with initiator details.
 */
const getActiveAlerts = catchAsync(async (_req, res) => {
  const alerts = await SafetyService.getActiveAlerts();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Active safety alerts retrieved successfully',
    data: { alerts, total: alerts.length },
  });
});

export const SafetyController = {
  triggerSos,
  resolveAlert,
  getActiveAlerts,
};
