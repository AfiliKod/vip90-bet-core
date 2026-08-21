import { Router } from 'express';
import { getActiveCurrency, listCurrencies } from '../currency/index.js';

const r = Router();

/**
 * Herkese açık, kimlik doğrulama gerektirmez — theme.js ile aynı yaklaşım,
 * sayfa yüklenirken en erken anda çağrılır.
 */
r.get('/', async (req, res, next) => {
  try {
    const active = await getActiveCurrency();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ active, supported: listCurrencies() });
  } catch (e) { next(e); }
});

export default r;
