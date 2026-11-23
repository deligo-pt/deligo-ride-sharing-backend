import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { SupportController } from './support.controller';
import { SupportValidation } from './support.validation';

// Mounted at: /api/v1/support (see src/routes/index.ts) — PRD 3.x
// Every route is open to any authenticated user, except /admin/* (ADMIN only).
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
// Users see their own tickets; ADMIN sees all (paginated, ?status= / ?priority=).
router.get(
  '/tickets',
  authenticate,
  validateRequest(SupportValidation.listTickets),
  SupportController.listTickets,
);

// /:id routes must come AFTER specific named sub-paths.
// Owner or ADMIN may reply (ownership is enforced in the service); an admin reply assigns + notifies.
router.post(
  '/tickets/:id/messages',
  authenticate,
  validateRequest(SupportValidation.addTicketMessage),
  SupportController.addTicketMessage,
);

// ── Admin-only ticket management ──────────────────────────────────────────────
// Update status / priority (the first admin to touch a ticket claims it).
router.patch(
  '/admin/tickets/:id',
  authenticate,
  authorize('ADMIN'),
  validateRequest(SupportValidation.updateTicket),
  SupportController.updateTicket,
);

export default router;
