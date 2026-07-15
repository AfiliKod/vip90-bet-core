import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema, changeEmailSchema,
  dataExportRequestSchema, accountDeletionRequestSchema,
} from '../validators/auth.js';
import * as ctrl from '../controllers/users.js';

const r = Router();
r.use(requireAuth);

r.get('/me', ctrl.getMe);
r.get('/me/bets', ctrl.getMyBets);
r.get('/me/transactions', ctrl.getMyTransactions);
r.get('/me/preferences', ctrl.getPreferences);
r.put('/me/preferences', ctrl.updatePreferences);

// Password + Email change (Phase B14 — Zod validated)
r.put('/me/password', validate(changePasswordSchema), ctrl.updatePassword);
r.put('/me/email', validate(changeEmailSchema), ctrl.updateEmail);

// KVKK md.11 — Self-service data export (Phase A6 / D5)
r.get('/me/data-export', validate(dataExportRequestSchema), ctrl.exportMyData);
// Account deletion (30-day grace)
r.delete('/me', validate(accountDeletionRequestSchema), ctrl.requestAccountDeletion);
r.post('/me/cancel-deletion', ctrl.cancelAccountDeletion);

// Responsible gambling limits (Phase D4)
r.get('/me/limits', ctrl.getLimits);
r.put('/me/limits', ctrl.updateLimits);

export default r;