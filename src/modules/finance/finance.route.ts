import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { FinanceController } from './finance.controller';
import { FinanceValidation } from './finance.validation';

// Mounted at: /api/v1/admin/finances (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.get('/ledger', validateRequest(FinanceValidation.ledger), FinanceController.getLedger);

export default router;
