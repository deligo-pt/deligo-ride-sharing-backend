import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import {
  addEmergencyContactHandler,
  addTicketMessageHandler,
  createTicketHandler,
  getEmergencyContactsHandler,
  getMyTicketsHandler,
  triggerSosHandler,
} from './support.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Support Router  —  PRD 3.x: Customer Support & Safety
// Mounted at: /api/v1/support  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ── Emergency Contacts ────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/emergency-contacts
 * Add an emergency contact (max 3 per user).
 * Role: any authenticated user
 */
router.post('/emergency-contacts', requireAuth, addEmergencyContactHandler);

/**
 * GET /api/v1/support/emergency-contacts
 * List the authenticated user's emergency contacts.
 * Role: any authenticated user
 */
router.get('/emergency-contacts', requireAuth, getEmergencyContactsHandler);

// ── SOS ───────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/sos
 * Trigger an SOS alert: notifies admins, mock-SMSes emergency contacts,
 * and flips the linked ride to EMERGENCY status.
 * Role: any authenticated user
 */
router.post('/sos', requireAuth, triggerSosHandler);

// ── Ticketing System ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets
 * Create a new support ticket.
 * Role: any authenticated user
 */
router.post('/tickets', requireAuth, createTicketHandler);

/**
 * GET /api/v1/support/tickets
 * Return all tickets created by the authenticated user.
 * Role: any authenticated user
 */
router.get('/tickets', requireAuth, getMyTicketsHandler);

/**
 * POST /api/v1/support/tickets/:id/messages
 * Add a message to an existing ticket (Live Chat thread).
 * Role: ticket owner OR ADMIN
 * NOTE: /:id routes must come AFTER any specific named sub-paths.
 */
router.post('/tickets/:id/messages', requireAuth, addTicketMessageHandler);

export default router;
