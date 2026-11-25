import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { SupportController } from './support.controller';
import { SupportValidation } from './support.validation';

const router: Router = Router();

router.post(
  '/emergency-contacts',
  authenticate,
  validateRequest(SupportValidation.addEmergencyContact),
  SupportController.addEmergencyContact,
);
router.get('/emergency-contacts', authenticate, SupportController.getEmergencyContacts);

router.post(
  '/tickets',
  authenticate,
  validateRequest(SupportValidation.createTicket),
  SupportController.createTicket,
);
router.get(
  '/tickets',
  authenticate,
  validateRequest(SupportValidation.listTickets),
  SupportController.listTickets,
);

router.post(
  '/tickets/:id/messages',
  authenticate,
  validateRequest(SupportValidation.addTicketMessage),
  SupportController.addTicketMessage,
);

router.patch(
  '/admin/tickets/:id',
  authenticate,
  authorize('ADMIN'),
  validateRequest(SupportValidation.updateTicket),
  SupportController.updateTicket,
);

export const supportRouter = router;
