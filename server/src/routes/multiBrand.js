import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import * as ctrl from '../controllers/multiBrand.js';

const r = Router();

// Admin — brands
r.get('/', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getAllBrandsHandler);
r.get('/default', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getDefaultBrandHandler);
r.get('/stats', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getBrandStatsHandler);
r.get('/slug/:slug', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getBrandBySlugHandler);
r.get('/domain/:domain', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getBrandByDomainHandler);
r.get('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getBrandByIdHandler);
r.post('/', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.createBrandHandler);
r.patch('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.updateBrandHandler);
r.delete('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.deleteBrandHandler);
r.post('/:id/domains', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.addDomainHandler);
r.delete('/:id/domains/:domain', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.removeDomainHandler);
r.patch('/:id/domains/:domain/primary', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.setPrimaryDomainHandler);

export default r;
