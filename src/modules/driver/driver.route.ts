import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { kycUpload } from '../../middlewares/uploadMiddleware';
import { validateRequest } from '../../middlewares/validateRequest';
import { DriverController } from './driver.controller';
import { DriverValidation, REQUIRED_KYC_DOCUMENTS } from './driver.validation';

// Mounted at: /api/v1/drivers (see src/routes/index.ts) — PRD 2.2
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

// Bulk KYC upload (multipart). File fields are named after DocumentType values;
// optional text fields <TYPE>_expiryDate carry ISO 8601 dates.
router.post(
  '/documents',
  authenticate,
  authorize('DRIVER'),
  kycUpload.fields(REQUIRED_KYC_DOCUMENTS.map((doc) => ({ name: doc.type, maxCount: 1 }))),
  validateRequest(DriverValidation.uploadDocuments),
  DriverController.uploadDocuments,
);

export default router;
