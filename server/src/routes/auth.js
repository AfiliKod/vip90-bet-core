import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  registerSchema, loginSchema,
  emailVerifySchema, passwordResetRequestSchema, passwordResetConfirmSchema,
  resendVerificationSchema,
} from '../validators/auth.js';
import * as ctrl from '../controllers/auth.js';
import { registerLimiter, loginLimiter, emailFlowLimiter } from '../middleware/rateLimit.js';
import { guestOnly } from '../middleware/guestOnly.js';
import { createTurnstileMiddleware, publicTurnstileConfig } from '../middleware/turnstile.js';

const r = Router();

// Rate limiting (Phase B1) - skip in test mode
const testMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';
const skipInTest = (limiter) => (testMode ? (req, res, next) => next() : limiter);

// Turnstile: TURNSTILE_SECRET_KEY + TURNSTILE_SITE_KEY tanımlı değilse no-op.
const turnstile = createTurnstileMiddleware();
r.get('/turnstile-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(publicTurnstileConfig());
});

r.post('/register', guestOnly, skipInTest(registerLimiter), turnstile, validate(registerSchema), ctrl.register);
r.post('/login', guestOnly, skipInTest(loginLimiter), turnstile, validate(loginSchema), ctrl.login);
r.post('/refresh', ctrl.refresh);
r.post('/logout', ctrl.logout);

// Email doğrulama (Phase D1)
r.get('/verify-email', ctrl.verifyEmail);
r.post('/verify-email', validate(emailVerifySchema), ctrl.verifyEmail);
r.post('/resend-verification', skipInTest(emailFlowLimiter), validate(resendVerificationSchema), ctrl.resendVerification);

// Şifre sıfırlama (Phase D2) — guestOnly: açık oturum bu akışı hiç başlatamaz
r.post('/forgot-password', guestOnly, skipInTest(emailFlowLimiter), turnstile, validate(passwordResetRequestSchema), ctrl.forgotPassword);
r.post('/reset-password', guestOnly, skipInTest(emailFlowLimiter), validate(passwordResetConfirmSchema), ctrl.resetPassword);

export default r;