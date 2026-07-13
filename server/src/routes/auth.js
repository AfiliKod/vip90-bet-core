import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  registerSchema, loginSchema,
  emailVerifySchema, passwordResetRequestSchema, passwordResetConfirmSchema,
  resendVerificationSchema,
} from '../validators/auth.js';
import * as ctrl from '../controllers/auth.js';

const r = Router();

// Rate limiting (Phase B1)
import { authLimiter } from '../middleware/rateLimit.js';

r.post('/register', authLimiter, validate(registerSchema), ctrl.register);
r.post('/login', authLimiter, validate(loginSchema), ctrl.login);
r.post('/refresh', ctrl.refresh);
r.post('/logout', ctrl.logout);

// Email doğrulama (Phase D1)
r.get('/verify-email', ctrl.verifyEmail);
r.post('/verify-email', validate(emailVerifySchema), ctrl.verifyEmail);
r.post('/resend-verification', authLimiter, validate(resendVerificationSchema), ctrl.resendVerification);

// Şifre sıfırlama (Phase D2)
r.post('/forgot-password', authLimiter, validate(passwordResetRequestSchema), ctrl.forgotPassword);
r.post('/reset-password', authLimiter, validate(passwordResetConfirmSchema), ctrl.resetPassword);

export default r;
