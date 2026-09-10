/**
 * U5 — İstemcinin operatör saat dilimini/varsayılan dilini öğrenmesi için
 * herkese açık uç.
 *
 * GET /api/locale-config → { timezone, defaultLocale }
 * Sunucu tarihleri UTC saklar; saat dilimi istemcide render anında uygulanır.
 * `defaultLocale`, `client/src/i18n/I18nProvider.jsx`'in localStorage'da
 * hiç seçim yokken (ilk ziyaret) kullandığı değer — kullanıcı navbar'dan
 * kendi dilini seçtiğinde bu değeri HER ZAMAN ezer.
 */
import { Router } from 'express';
import { timezoneStore } from '../services/timezoneLive.js';
import { localeStore } from '../services/localeLive.js';

const r = Router();

r.get('/', async (req, res, next) => {
  try {
    const [timezone, defaultLocale] = await Promise.all([timezoneStore.get(), localeStore.get()]);
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ timezone, defaultLocale });
  } catch (e) { next(e); }
});

export default r;
