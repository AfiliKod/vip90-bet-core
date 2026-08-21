/**
 * U5 — İstemcinin operatör saat dilimini öğrenmesi için herkese açık uç.
 *
 * GET /api/locale-config → { timezone }
 * Sunucu tarihleri UTC saklar; saat dilimi istemcide render anında uygulanır.
 */
import { Router } from 'express';
import { timezoneStore } from '../services/timezoneLive.js';

const r = Router();

r.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ timezone: await timezoneStore.get() });
  } catch (e) { next(e); }
});

export default r;
