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

const r = Router();

// Rate limiting (Phase B1) - skip in test mode
const testMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';
const skipInTest = (limiter) => (testMode ? (req, res, next) => next() : limiter);

r.post('/register', guestOnly, skipInTest(registerLimiter), validate(registerSchema), ctrl.register);
r.post('/login', guestOnly, skipInTest(loginLimiter), validate(loginSchema), ctrl.login);
r.post('/refresh', ctrl.refresh);
r.post('/logout', ctrl.logout);

// Email doğrulama (Phase D1)
r.get('/verify-email', ctrl.verifyEmail);
r.post('/verify-email', validate(emailVerifySchema), ctrl.verifyEmail);
r.post('/resend-verification', skipInTest(emailFlowLimiter), validate(resendVerificationSchema), ctrl.resendVerification);

// Şifre sıfırlama (Phase D2) — guestOnly: açık oturum bu akışı hiç başlatamaz
r.post('/forgot-password', guestOnly, skipInTest(emailFlowLimiter), validate(passwordResetRequestSchema), ctrl.forgotPassword);
r.post('/reset-password', guestOnly, skipInTest(emailFlowLimiter), validate(passwordResetConfirmSchema), ctrl.resetPassword);

export default r;