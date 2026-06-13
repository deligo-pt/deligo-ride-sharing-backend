import { Router } from 'express';
import { requireAuth } from '../../middlewares/mockAuth';
import { registerUserHandler, getWalletHandler } from './customers.controller';

// ─────────────────────────────────────────────────────────────────────────────
// Customer Router — PRD 3.10
// Mounted at: /api/v1/customers  (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/v1/customers/register  (Public)
 *
 * Create a new customer account. Accepts an optional `referredByCode` in the
 * body. If valid, the new user is linked to the referrer so the bonus hook
 * fires after their first completed ride.
 *
 * Body: { email, phone, firstName?, lastName?, role?, referredByCode? }
 */
router.post('/register', registerUserHandler);

/**
 * GET /api/v1/customers/me/wallet  (Role: CUSTOMER)
 *
 * Returns the authenticated customer's wallet balance and full transaction
 * history (REFERRAL_BONUS, RIDE_PAYMENT, PROMO_CREDIT).
 */
router.get('/me/wallet', requireAuth, getWalletHandler);

export default router;

