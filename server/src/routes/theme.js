import { Router } from 'express';
import { getThemeCssVars } from '../theme/index.js';

const r = Router();

/**
 * Herkese açık, kimlik doğrulama gerektirmez — sayfa yüklenirken en erken
 * anda çağrılır ki flash-of-default-theme minimize olsun.
 */
r.get('/', async (req, res, next) => {
  try {
    const vars = await getThemeCssVars();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ vars });
  } catch (e) { next(e); }
});

export default r;
