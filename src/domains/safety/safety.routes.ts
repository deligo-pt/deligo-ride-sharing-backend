import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import {
  getActiveAlertsHandler,
  resolveAlertHandler,
  triggerSosHandler,
} from './safety.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Safety Router  —  PRD 3.13 / 4.13: Emergency SOS & Real-Time Safety Escalation
// Mounted at: /api/v1/safety  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// ── IMPORTANT: specific named routes must be declared BEFORE /:id routes ─────

/**
 * GET /api/v1/safety/sos/active
 * Returns all currently ACTIVE emergency alerts.
 * Role: ADMIN
 */
router.get('/sos/active', requireAuth, getActiveAlertsHandler);

/**
 * POST /api/v1/safety/sos
 * Triggers an SOS alert from a customer or driver.
 * Role: CUSTOMER | DRIVER
 */
router.post('/sos', requireAuth, triggerSosHandler);

/**
 * PATCH /api/v1/safety/sos/:id/resolve
 * Admin resolves or dismisses an active emergency alert.
 * Role: ADMIN
 */
router.patch('/sos/:id/resolve', requireAuth, resolveAlertHandler);

export default router;
