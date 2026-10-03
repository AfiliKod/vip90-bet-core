import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission as defaultRequirePermission } from '../services/permissions.js';
import { seoSettingsSchema } from '../seo/schema.js';
import { seoStore } from '../seo/store.js';

/** /api/admin/settings/seo — oku/yaz. Üst router requireAuth + requireAdmin uygular. */
export function createSeoAdminRouter({ store = seoStore, requirePermission = defaultRequirePermission } = {}) {
  const r = Router();
  r.get('/', requirePermission('admin:settings:read'), async (req, res, next) => {
    try { res.json({ settings: await store.get() }); } catch (e) { next(e); }
  });
  r.put('/', requirePermission('admin:settings:write'), validate(seoSettingsSchema), async (req, res, next) => {
    try { res.json({ settings: await store.update(req.validated, req.user?.id) }); } catch (e) { next(e); }
  });
  return r;
}

export default createSeoAdminRouter();
