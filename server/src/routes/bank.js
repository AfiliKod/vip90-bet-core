import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { depositSchema, withdrawSchema } from '../validators/transaction.js';
import { financialLimiter } from '../middleware/rateLimit.js';
import * as ctrl from '../controllers/bank.js';

const r = Router();

r.get('/info', ctrl.getInfo);
r.post('/deposit', requireAuth, financialLimiter, validate(depositSchema), ctrl.createDeposit);
r.post('/withdraw', requireAuth, financialLimiter, validate(withdrawSchema), ctrl.createWithdraw);
r.get('/requests', requireAuth, ctrl.getMyRequests);

/* Admin */
r.get('/admin/pending', requireAuth, requireAdmin, ctrl.getAllPending);
r.patch('/admin/pending/:id/approve', requireAuth, requireAdmin, ctrl.approve);
r.patch('/admin/pending/:id/reject', requireAuth, requireAdmin, ctrl.reject);

export default r;