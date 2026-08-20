import { Router } from 'express';
import { getBrandingValues } from '../branding/index.js';

const r = Router();

/**
 * Herkese açık, kimlik doğrulama gerektirmez — sayfa yüklenirken (title,
 * favicon, custom font, logo) en erken anda çağrılır.
 */
r.get('/', async (req, res, next) => {
  try {
    const values = await getBrandingValues();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ values });
  } catch (e) { next(e); }
});

export default r;
