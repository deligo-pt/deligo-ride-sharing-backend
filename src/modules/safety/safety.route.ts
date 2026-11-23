import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { SafetyController } from './safety.controller';
import { SafetyValidation } from './safety.validation';

// Mounted at: /api/v1/safety (see src/routes/index.ts) — PRD 3.13 / 4.13
const router: Router = Router();

// Specific named routes must be declared BEFORE /:id routes.

// All currently ACTIVE emergency alerts — ADMIN
router.get('/sos/active', authenticate, authorize('ADMIN'), SafetyController.getActiveAlerts);

// Trigger an SOS alert — CUSTOMER | DRIVER
router.post(
  '/sos',
  authenticate,
  authorize('CUSTOMER', 'DRIVER'),
  validateRequest(SafetyValidation.triggerSos),
  SafetyController.triggerSos,
);

// Resolve or dismiss an active alert — ADMIN
router.patch(
  '/sos/:id/resolve',
  authenticate,
  authorize('ADMIN'),
  validateRequest(SafetyValidation.resolveAlert),
  SafetyController.resolveAlert,
);

export default router;
