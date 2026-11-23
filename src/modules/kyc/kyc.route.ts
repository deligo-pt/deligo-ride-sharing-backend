import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { kycUpload } from '../../middlewares/uploadMiddleware';
import { validateRequest } from '../../middlewares/validateRequest';
import { KycController } from './kyc.controller';
import { KycValidation, REQUIRED_KYC_DOCUMENTS } from './kyc.validation';

// Mounted at: /api/v1/kyc (see src/routes/index.ts)
const router: Router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.get('/requirements', KycController.getKycRequirements);

// ─── Driver ───────────────────────────────────────────────────────────────────
router.get('/status', authenticate, authorize('DRIVER'), KycController.getKycStatus);

// Bulk upload: every required document as a separate multipart file field named
// after its DocumentType. A missing field returns 400 listing all absent documents.
router.post(
  '/documents',
  authenticate,
  authorize('DRIVER'),
  kycUpload.fields(REQUIRED_KYC_DOCUMENTS.map((doc) => ({ name: doc.type, maxCount: 1 }))),
  validateRequest(KycValidation.uploadDocuments),
  KycController.uploadDocuments,
);

router.get('/documents/me', authenticate, authorize('DRIVER'), KycController.getMyDocuments);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get(
  '/documents/pending',
  authenticate,
  authorize('ADMIN'),
  KycController.getPendingDocuments,
);
router.get('/documents/all', authenticate, authorize('ADMIN'), KycController.getAllDocuments);
router.patch(
  '/documents/:id/review',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.reviewDocument),
  KycController.reviewDocument,
);

// Driver-profile level KYC review queue (approve/reject the whole submission)
router.get('/profiles/pending', authenticate, authorize('ADMIN'), KycController.getPendingProfiles);
router.patch(
  '/profiles/:driverProfileId/review',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.reviewProfile),
  KycController.reviewProfile,
);

export default router;
