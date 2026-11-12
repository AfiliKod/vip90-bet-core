import { scopeTenantId } from '../tenancy/tenantFilter.js';
import StaticPage from '../models/StaticPage.js';
import { createError } from '../middleware/error.js';

/**
 * Static page `:id` handlers, tenant-scoped (İP-5, §9 G-3): a `:id` that
 * belongs to another tenant answers 404 `NOT_FOUND`, never 403 and never
 * the record. The pre-existing slug-based public and admin flows
 * (`services/staticPages.js`, `controllers/admin.js`) are wired elsewhere
 * and unchanged.
 */

function scopedIdFilter(id, tenantId) {
  const filter = { _id: id };
  if (tenantId) filter.tenantId = tenantId;
  return filter;
}

/** GET static page by id (tenant-scoped) */
export async function getStaticPageById(req, res, next) {
  try {
    const page = await StaticPage.findOne(scopedIdFilter(req.params.id, scopeTenantId(req)));
    if (!page) throw createError(404, 'NOT_FOUND', 'Sayfa bulunamadı');
    res.json({ page });
  } catch (error) {
    next(error);
  }
}

/** PATCH static page by id (tenant-scoped) */
export async function updateStaticPage(req, res, next) {
  try {
    // Never trust _id/tenantId from the body: identity and tenant come from
    // the route and the ambient tenant binding.
    const { _id, tenantId: _skip, ...body } = req.body ?? {};
    const page = await StaticPage.findOneAndUpdate(
      scopedIdFilter(req.params.id, scopeTenantId(req)),
      { $set: { ...body, updatedBy: req.user?.id ?? null } },
      { new: true, runValidators: true },
    );
    if (!page) throw createError(404, 'NOT_FOUND', 'Sayfa bulunamadı');
    res.json({ page });
  } catch (error) {
    next(error);
  }
}
