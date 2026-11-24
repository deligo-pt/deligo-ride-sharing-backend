import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { FinanceController } from './finance.controller';
import { FinanceValidation } from './finance.validation';

const router: Router = Router();

router.get(
  '/ledger',
  authenticate,
  authorize('ADMIN'),
  validateRequest(FinanceValidation.ledger),
  FinanceController.getLedger,
);

export default router;
