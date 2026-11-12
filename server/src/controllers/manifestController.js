import { getBrandingValues } from '../branding/index.js';
import Tenant from '../models/Tenant.js';
import { getCurrentTenantId } from '../tenancy/context.js';

export const DEFAULT_ICONS = [
  { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
  { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
  { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
  { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
  { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
  { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
  { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
];

/**
 * Per-tenant PWA manifest. The install's own settings win; the tenant name is
 * the neutral fallback so core never carries a product brand.
 */
export async function buildManifestPayload(overrides = {}) {
  const tenantId = getCurrentTenantId();
  let tenantName = null;
  if (tenantId) {
    const tenant = await Tenant.findById(tenantId).select('name').lean();
    tenantName = tenant?.name || null;
  }

  const values = await getBrandingValues();
  const name = overrides.siteName || values.siteName || tenantName || 'Casino';
  const themeColor = overrides.primaryColor || values.primaryColor || '#7c3aed';

  return {
    name,
    short_name: name,
    description: 'Spor bahis ve casino platformu',
    theme_color: themeColor,
    background_color: '#0f172a',
    display: 'standalone',
    orientation: 'portrait-primary',
    scope: '/',
    start_url: '/',
    icons: DEFAULT_ICONS,
  };
}

export async function serveManifest(req, res, next) {
  try {
    const payload = await buildManifestPayload();
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.json(payload);
  } catch (err) {
    next(err);
  }
}
