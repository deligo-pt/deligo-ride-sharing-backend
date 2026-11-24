import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { SafetyController } from './safety.controller';
import { SafetyValidation } from './safety.validation';

const router: Router = Router();

router.get('/sos/active', authenticate, authorize('ADMIN'), SafetyController.getActiveAlerts);

router.post(
  '/sos',
  authenticate,
  authorize('CUSTOMER', 'DRIVER'),
  validateRequest(SafetyValidation.triggerSos),
  SafetyController.triggerSos,
);

router.patch(
  '/sos/:id/resolve',
  authenticate,
  authorize('ADMIN'),
  validateRequest(SafetyValidation.resolveAlert),
  SafetyController.resolveAlert,
);

export default router;
