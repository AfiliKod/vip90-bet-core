import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import * as ctrl from '../controllers/bank.js';

const r = Router();

const depositSchema = z.object({ amount: z.number().min(10).max(50000) });
const withdrawSchema = z.object({ amount: z.number().min(20).max(50000) });

r.get('/info', ctrl.getInfo);
r.post('/deposit', requireAuth, validate(depositSchema), ctrl.createDeposit);
r.post('/withdraw', requireAuth, validate(withdrawSchema), ctrl.createWithdraw);
r.get('/requests', requireAuth, ctrl.getMyRequests);

/* Admin */
r.get('/admin/pending', requireAuth, requireAdmin, ctrl.getAllPending);
r.patch('/admin/pending/:id/approve', requireAuth, requireAdmin, ctrl.approve);
r.patch('/admin/pending/:id/reject', requireAuth, requireAdmin, ctrl.reject);

export default r;
