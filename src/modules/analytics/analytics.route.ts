import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsValidation } from './analytics.validation';

const router: Router = Router();

router.get('/dashboard', authenticate, authorize('ADMIN'), AnalyticsController.getDashboard);
router.get(
  '/trends',
  authenticate,
  authorize('ADMIN'),
  validateRequest(AnalyticsValidation.trends),
  AnalyticsController.getTrends,
);
router.get(
  '/export',
  authenticate,
  authorize('ADMIN'),
  validateRequest(AnalyticsValidation.exportReport),
  AnalyticsController.exportReport,
);

export default router;
