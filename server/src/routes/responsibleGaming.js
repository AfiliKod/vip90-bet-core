import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { setLimitSchema, setSessionLimitSchema, activateCoolOffSchema, activateSelfExclusionSchema, restrictAccountSchema } from '../validators/responsibleGaming.js';
import * as ctrl from '../controllers/responsibleGaming.js';

const r = Router();

// Player routes
r.use(requireAuth);

// Get player's responsible gaming status
r.get('/me/status', ctrl.getPlayerStatus);

// Set limits
r.put('/me/limits/deposit', validate(setLimitSchema), ctrl.setDepositLimit);
r.put('/me/limits/loss', validate(setLimitSchema), ctrl.setLossLimit);
r.put('/me/limits/wager', validate(setLimitSchema), ctrl.setWagerLimit);
r.put('/me/limits/session', validate(setSessionLimitSchema), ctrl.setSessionLimit);

// Activate cool-off
r.post('/me/cool-off', validate(activateCoolOffSchema), ctrl.activateCoolOff);

// Activate self-exclusion
r.post('/me/self-exclusion', validate(activateSelfExclusionSchema), ctrl.activateSelfExclusion);

export default r;

// Admin routes
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin, requirePermission('admin:rg:manage'));

// Get restricted players
adminRouter.get('/players', requirePermission('admin:rg:read'), ctrl.getRestrictedPlayers);

// Restrict account
adminRouter.post('/restrict/:userId', auditLog('RESPONSIBLE_GAMING_RESTRICT'), validate(restrictAccountSchema), ctrl.restrictAccount);

// Lift restriction
adminRouter.delete('/restrict/:userId', auditLog('RESPONSIBLE_GAMING_LIFT'), ctrl.liftRestriction);

// Get audit log
adminRouter.get('/audit', requirePermission('admin:rg:read'), ctrl.getResponsibleGamingAudit);
