import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/auth';
import {
  initiateSignupHandler,
  resendOtpHandler,
  verifyOtpHandler,
  loginHandler,
  refreshTokenHandler,
  logoutHandler,
} from './auth.controller';
import {
  InitiateSignupSchema,
  ResendOtpSchema,
  VerifyOtpSchema,
  LoginSchema,
} from './auth.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Router
// Mounted at: /api/v1/auth (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// Middleware that attaches user identity if Bearer token is provided,
// but allows unauthenticated / expired requests to proceed to handler (e.g. For cookie-based logout).
async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  next();
}

// ── Registration Flow ────────────────────────────────────────────────────────
router.post('/signup/initiate', validate({ body: InitiateSignupSchema }), initiateSignupHandler);
router.post('/signup/resend-otp', validate({ body: ResendOtpSchema }), resendOtpHandler);
router.post('/signup/verify-otp', validate({ body: VerifyOtpSchema }), verifyOtpHandler);

// ── Login, Token Refresh & Logout Flow ───────────────────────────────────────
router.post('/login', validate({ body: LoginSchema }), loginHandler);
router.post('/refresh-token', refreshTokenHandler);
router.post('/logout', optionalAuthenticate, logoutHandler);

export default router;
