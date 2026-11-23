import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportValidation } from './admin-support.validation';

// Mounted at: /api/v1/admin/support (see src/routes/index.ts) — behind authenticate + authorize('ADMIN').
const router: Router = Router();

router.get(
  '/tickets',
  validateRequest(AdminSupportValidation.listTickets),
  AdminSupportController.getTickets,
);
router.patch(
  '/tickets/:id',
  validateRequest(AdminSupportValidation.updateTicket),
  AdminSupportController.updateTicket,
);
router.post(
  '/tickets/:id/messages',
  validateRequest(AdminSupportValidation.addTicketMessage),
  AdminSupportController.addTicketMessage,
);

export default router;
