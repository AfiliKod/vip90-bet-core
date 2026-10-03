import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import * as ctrl from '../controllers/multiCurrency.js';

const r = Router();

// Admin — currencies
r.get('/', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getAllCurrenciesHandler);
r.get('/default', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getDefaultCurrencyHandler);
r.get('/stats', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getCurrencyStatsHandler);
r.get('/:code', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getCurrencyByCodeHandler);
r.post('/', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.createCurrencyHandler);
r.patch('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.updateCurrencyHandler);
r.delete('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.deleteCurrencyHandler);
r.post('/convert', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.convertAmountHandler);
r.patch('/:id/rate', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.updateExchangeRateHandler);
r.post('/rates/bulk', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.bulkUpdateExchangeRatesHandler);

export default r;
