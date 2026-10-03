import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import { validate } from '../middleware/validate.js';
import { depositSchema, withdrawSchema } from '../validators/transaction.js';
import { adminRejectSchema } from '../validators/bank.js';
import { financialLimiter } from '../middleware/rateLimit.js';
import { checkDepositLimits, enforceResponsibleGaming } from '../middleware/responsibleGaming.js';
import { enforceRiskCheck } from '../middleware/risk.js';
import * as ctrl from '../controllers/bank.js';

const r = Router();

r.get('/info', requireAuth, ctrl.getInfo);
r.post('/deposit', requireAuth, financialLimiter, validate(depositSchema), enforceRiskCheck('deposit'), checkDepositLimits, ctrl.createDeposit);
r.post('/withdraw', requireAuth, financialLimiter, validate(withdrawSchema), enforceRiskCheck('withdraw'), enforceResponsibleGaming('withdraw'), ctrl.createWithdraw);
r.get('/requests', requireAuth, ctrl.getMyRequests);

/* Admin */
r.get('/admin/pending', requireAuth, requireAdmin, requirePermission('admin:bank:read'), ctrl.getAllPending);
r.patch('/admin/pending/:id/approve', requireAuth, requireAdmin, requirePermission('admin:bank:write'), ctrl.approve);
r.patch('/admin/pending/:id/reject', requireAuth, requireAdmin, requirePermission('admin:bank:write'), validate(adminRejectSchema), ctrl.reject);

export default r;