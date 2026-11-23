import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { SupportController } from './support.controller';
import { SupportValidation } from './support.validation';

// Mounted at: /api/v1/support (see src/routes/index.ts) — PRD 3.x
// Every route is open to any authenticated user.
const router: Router = Router();

// ── Emergency Contacts (max 3 per user) ───────────────────────────────────────
router.post(
  '/emergency-contacts',
  authenticate,
  validateRequest(SupportValidation.addEmergencyContact),
  SupportController.addEmergencyContact,
);
router.get('/emergency-contacts', authenticate, SupportController.getEmergencyContacts);

// SOS lives in the safety module: POST /api/v1/safety/sos

// ── Ticketing ─────────────────────────────────────────────────────────────────
router.post(
  '/tickets',
  authenticate,
  validateRequest(SupportValidation.createTicket),
  SupportController.createTicket,
);
router.get('/tickets', authenticate, SupportController.getMyTickets);

// /:id routes must come AFTER specific named sub-paths. Owner or ADMIN (checked in the service).
router.post(
  '/tickets/:id/messages',
  authenticate,
  validateRequest(SupportValidation.addTicketMessage),
  SupportController.addTicketMessage,
);

export default router;
