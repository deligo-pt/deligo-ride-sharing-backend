import { SafetyService } from './safety.service';
import { ResolveAlertDto, TriggerSosDto } from './safety.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

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
