import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/auth';
import { authRateLimiter } from '../../middlewares/rateLimiter';
import {
  initiateSignupHandler,
  resendOtpHandler,
  verifyOtpHandler,
  loginHandler,
  googleLoginHandler,
  facebookLoginHandler,
  appleLoginHandler,
  refreshTokenHandler,
  logoutHandler,
} from './auth.controller';
import {
  InitiateSignupSchema,
  ResendOtpSchema,
  VerifyOtpSchema,
  LoginSchema,
  GoogleLoginSchema,
  FacebookLoginSchema,
  AppleLoginSchema,
} from './auth.validation';
import driverAuthRouter from './driver-auth.route';
import adminAuthRouter from './admin-auth.route';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Router
// Mounted at: /api/v1/auth (see app.ts)
// ─────────────────────────────────────────────────────────────────────────────

const router: Router = Router();

// Middleware that attaches user identity if Bearer token is provided,
// but allows unauthenticated / expired requests to proceed to handler (e.g. for cookie-based logout).
async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return authenticate(req, res, (_err) => {
      // If token verification fails (expired/invalid), proceed without req.user
      next();
    });
  }
  next();
}

// ── Driver & Admin Auth Sub-Routers ──────────────────────────────────────────
router.use('/driver', authRateLimiter, driverAuthRouter);
router.use('/admin', authRateLimiter, adminAuthRouter);

// ── Registration Flow ────────────────────────────────────────────────────────
router.post('/signup/initiate', authRateLimiter, validate({ body: InitiateSignupSchema }), initiateSignupHandler);
router.post('/signup/resend-otp', authRateLimiter, validate({ body: ResendOtpSchema }), resendOtpHandler);
router.post('/signup/verify-otp', authRateLimiter, validate({ body: VerifyOtpSchema }), verifyOtpHandler);

// ── Login, Token Refresh & Logout Flow ───────────────────────────────────────
router.post('/login', authRateLimiter, validate({ body: LoginSchema }), loginHandler);
router.post('/google', authRateLimiter, validate({ body: GoogleLoginSchema }), googleLoginHandler);
router.post('/facebook', authRateLimiter, validate({ body: FacebookLoginSchema }), facebookLoginHandler);
router.post('/apple', authRateLimiter, validate({ body: AppleLoginSchema }), appleLoginHandler);
router.post('/refresh-token', refreshTokenHandler);
router.post('/logout', optionalAuthenticate, logoutHandler);

export default router;
