/**
 * Modül Ayarları — admin panelinin yeni "in-house oyun provider'ı / odds-data
 * provider'ı / Palace" ayar yüzeyi. `admin.js`'e dokunmadan kendi router'ıyla
 * mount edilir (bkz. controllers/modules.js'teki aynı desen — "Akış B'nin
 * alanıyla çakışmaz").
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import {
  updateInhouseProviderSettingsSchema,
  updateOddsProviderSettingsSchema,
  updatePalaceModuleSettingsSchema,
} from '../validators/admin.js';
import {
  getInhouseProviderSettings,
  updateInhouseProviderSettings,
  rotateInhouseProviderApiKey,
} from '../services/inhouseProviderSettings.js';
import {
  getOddsProviderSettings,
  updateOddsProviderSettings,
  AVAILABLE_CATEGORIES,
} from '../services/oddsProviderSettings.js';
import {
  getPalaceDefaultLanguage,
  setPalaceDefaultLanguage,
  getPopularGameCodes,
  setPopularGameCodes,
} from '../services/palaceModuleSettings.js';
import { randomBytes } from 'crypto';

const r = Router();
r.use(requireAuth, requireAdmin, auditLog('ADMIN_ACTION'));

// ─── In-house oyunlar provider'ı ───────────────────────────────────────────
r.get('/inhouse-provider/settings', async (req, res, next) => {
  try {
    res.json(await getInhouseProviderSettings());
  } catch (e) { next(e); }
});

r.patch('/inhouse-provider/settings', validate(updateInhouseProviderSettingsSchema), async (req, res, next) => {
  try {
    res.json(await updateInhouseProviderSettings(req.body));
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.post('/inhouse-provider/rotate-key', async (req, res, next) => {
  try {
    const { apiKeyId, apiKeySecret } = await rotateInhouseProviderApiKey();
    res.json({
      apiKeyId,
      apiKeySecret,
      warning: 'Bu secret bir daha gösterilmeyecek. Hemen server/.env dosyasındaki INHOUSE_PROVIDER_API_SECRET değerini bununla değiştirip sunucuyu yeniden başlatın — aksi halde in-house oyunlar 401 ile başarısız olur.',
    });
  } catch (e) { next(e); }
});

// ─── Bahis verisi (odds-data provider) ─────────────────────────────────────
r.get('/odds-provider/settings', async (req, res, next) => {
  try {
    const settings = await getOddsProviderSettings();
    res.json({
      ...settings,
      availableCategories: AVAILABLE_CATEGORIES,
      tokenConfigured: !!process.env.ODDS_PROVIDER_API_TOKEN,
    });
  } catch (e) { next(e); }
});

r.patch('/odds-provider/settings', validate(updateOddsProviderSettingsSchema), async (req, res, next) => {
  try {
    const updated = await updateOddsProviderSettings(req.body, req.user?.id);
    res.json({
      ...updated,
      availableCategories: AVAILABLE_CATEGORIES,
      tokenConfigured: !!process.env.ODDS_PROVIDER_API_TOKEN,
    });
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.post('/odds-provider/suggest-token', (req, res) => {
  res.json({
    suggestedToken: randomBytes(32).toString('hex'),
    warning: 'Bu öneri hiçbir yere kaydedilmedi. Kullanmak için hem server/.env hem odds-provider/.env dosyalarına ODDS_PROVIDER_API_TOKEN olarak AYNI değeri yazıp HER İKİ servisi de yeniden başlatın.',
  });
});

// ─── Palace Casino modül ayarları ──────────────────────────────────────────
r.get('/palace/module-settings', async (req, res, next) => {
  try {
    const [language, popularGameCodes] = await Promise.all([
      getPalaceDefaultLanguage(),
      getPopularGameCodes(),
    ]);
    res.json({ language, popularGameCodes });
  } catch (e) { next(e); }
});

r.patch('/palace/module-settings', validate(updatePalaceModuleSettingsSchema), async (req, res, next) => {
  try {
    const { language, popularGameCodes } = req.body;
    if (language !== undefined) await setPalaceDefaultLanguage(language, req.user?.id);
    if (popularGameCodes !== undefined) await setPopularGameCodes(popularGameCodes, req.user?.id);
    res.json({
      language: language !== undefined ? language : await getPalaceDefaultLanguage(),
      popularGameCodes: popularGameCodes !== undefined ? popularGameCodes : await getPopularGameCodes(),
    });
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

export default r;
