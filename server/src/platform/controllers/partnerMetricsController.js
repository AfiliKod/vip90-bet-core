import { getPortfolioMetrics, getTenantMetrics, getPartnerLinkedTenantIds } from '../services/partnerMetricsService.js';
import { createError } from '../../middleware/error.js';

export async function getPortfolioMetricsHandler(req, res, next) {
  try {
    const { from, to } = req.query;
    const data = await getPortfolioMetrics(req.partner._id, { from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getTenantMetricsHandler(req, res, next) {
  try {
    const tenantIds = await getPartnerLinkedTenantIds(req.partner._id);
    const isLinked = tenantIds.some((id) => String(id) === String(req.params.id));
    if (!isLinked) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

    const { from, to } = req.query;
    const data = await getTenantMetrics(req.partner._id, req.params.id, { from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
