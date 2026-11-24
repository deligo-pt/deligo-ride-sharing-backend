import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { kycUpload } from '../../middlewares/uploadMiddleware';
import { validateRequest } from '../../middlewares/validateRequest';
import { KycController } from './kyc.controller';
import { KycValidation } from './kyc.validation';
import { REQUIRED_KYC_DOCUMENTS } from './kyc.constant';

const router: Router = Router();

router.get('/requirements', KycController.getKycRequirements);

router.get('/status', authenticate, authorize('DRIVER'), KycController.getKycStatus);

router.post(
  '/documents',
  authenticate,
  authorize('DRIVER'),
  kycUpload.fields(REQUIRED_KYC_DOCUMENTS.map((doc) => ({ name: doc.type, maxCount: 1 }))),
  validateRequest(KycValidation.uploadDocuments),
  KycController.uploadDocuments,
);

router.get('/documents/me', authenticate, authorize('DRIVER'), KycController.getMyDocuments);

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

router.get('/profiles/pending', authenticate, authorize('ADMIN'), KycController.getPendingProfiles);
router.patch(
  '/profiles/:driverProfileId/review',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.reviewProfile),
  KycController.reviewProfile,
);

router.get(
  '/pending',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.getPendingKyc),
  KycController.getPendingKyc,
);

router.patch(
  '/:id/accept-user',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.acceptUser),
  KycController.acceptUser,
);

router.patch(
  '/:id/reject-user',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.rejectUser),
  KycController.rejectUser,
);

router.patch(
  '/:id/block-user',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.blockUser),
  KycController.blockUser,
);

router.patch(
  '/:id/unblock-user',
  authenticate,
  authorize('ADMIN'),
  validateRequest(KycValidation.unblockUser),
  KycController.unblockUser,
);

export default router;
