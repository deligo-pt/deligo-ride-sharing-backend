import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { DriverController } from './driver.controller';
import { DriverValidation } from './driver.validation';

// Mounted at: /api/v1/drivers (see src/routes/index.ts) — PRD 2.2
// KYC document upload is POST /api/v1/kyc/documents (single canonical endpoint).
const router: Router = Router();

// Declared BEFORE any /:id routes so "me" is not matched as an ID parameter.
router.get('/me', authenticate, authorize('DRIVER'), DriverController.getMyDashboard);

// ?page=1&limit=10
router.get(
  '/me/history',
  authenticate,
  authorize('DRIVER'),
  validateRequest(DriverValidation.tripHistory),
  DriverController.getTripHistory,
);

export default router;
