import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AdminUserController } from './admin-user.controller';
import { AdminUserValidation } from './admin-user.validation';

// Mounted at: /api/v1/admin (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
// Covers /admin/users and /admin/kyc.
const router: Router = Router();

// ── Driver KYC review ─────────────────────────────────────────────────────────
router.get('/kyc/pending', AdminUserController.getPendingKyc);
router.patch(
  '/kyc/:driverProfileId',
  validateRequest(AdminUserValidation.reviewKyc),
  AdminUserController.reviewKyc,
);

// ── User management ───────────────────────────────────────────────────────────
router.get('/users', validateRequest(AdminUserValidation.listUsers), AdminUserController.listUsers);
router.patch(
  '/users/:userId/status',
  validateRequest(AdminUserValidation.updateUserStatus),
  AdminUserController.updateUserStatus,
);

export default router;
