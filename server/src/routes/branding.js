import { Router } from 'express';
import { getBrandingValues, getSiteName } from '../branding/index.js';
import Tenant from '../models/Tenant.js';
import { getCurrentTenantId } from '../tenancy/context.js';

const r = Router();

/**
 * Herkese açık, kimlik doğrulama gerektirmez — sayfa yüklenirken (title,
 * favicon, custom font, logo) en erken anda çağrılır.
 */
r.get('/', async (req, res, next) => {
  try {
    const values = await getBrandingValues();
    let legalEntity = null;
    let tenantName = null;

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId).select('name legalEntity').lean();
      if (tenant) {
        tenantName = tenant.name;
        legalEntity = tenant.legalEntity || null;
      }
    }

    res.set('Cache-Control', 'public, max-age=30');
    // Ayarlanmamış site adı: sunucuyla aynı nötr yedek (kiracı adı, sonra boş).
    if (!values.siteName) values.siteName = (await getSiteName()) || null;
    res.json({ values, legalEntity, tenantName });
  } catch (e) { next(e); }
});

export default r;
