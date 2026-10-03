import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import * as ctrl from '../controllers/multiJurisdiction.js';

const r = Router();

// Admin — jurisdictions
r.get('/', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getAllJurisdictionsHandler);
r.get('/default', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getDefaultJurisdictionHandler);
r.get('/stats', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getJurisdictionStatsHandler);
r.get('/code/:code', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getJurisdictionByCodeHandler);
r.get('/code/:code/compliance', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getComplianceRulesHandler);
r.get('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getJurisdictionByIdHandler);
r.post('/', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.createJurisdictionHandler);
r.patch('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.updateJurisdictionHandler);
r.delete('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.deleteJurisdictionHandler);
r.post('/eligibility', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.checkPlayerEligibilityHandler);

export default r;
