import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  registerSchema, loginSchema,
  emailVerifySchema, passwordResetRequestSchema, passwordResetConfirmSchema,
  resendVerificationSchema,
} from '../validators/auth.js';
import * as ctrl from '../controllers/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const r = Router();

// Rate limiting (Phase B1) - skip in test mode
const testMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';
const conditionalAuthLimiter = testMode ? (req, res, next) => next() : authLimiter;

r.post('/register', conditionalAuthLimiter, validate(registerSchema), ctrl.register);
r.post('/login', conditionalAuthLimiter, validate(loginSchema), ctrl.login);
r.post('/refresh', ctrl.refresh);
r.post('/logout', ctrl.logout);

// Email doğrulama (Phase D1)
r.get('/verify-email', ctrl.verifyEmail);
r.post('/verify-email', validate(emailVerifySchema), ctrl.verifyEmail);
r.post('/resend-verification', conditionalAuthLimiter, validate(resendVerificationSchema), ctrl.resendVerification);

// Şifre sıfırlama (Phase D2)
r.post('/forgot-password', conditionalAuthLimiter, validate(passwordResetRequestSchema), ctrl.forgotPassword);
r.post('/reset-password', conditionalAuthLimiter, validate(passwordResetConfirmSchema), ctrl.resetPassword);

export default r;