import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsValidation } from './analytics.validation';

// Mounted at: /api/v1/admin/analytics (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.get('/dashboard', AnalyticsController.getDashboard);
router.get('/trends', validateRequest(AnalyticsValidation.trends), AnalyticsController.getTrends);
router.get(
  '/export',
  validateRequest(AnalyticsValidation.exportReport),
  AnalyticsController.exportReport,
);

export default router;
