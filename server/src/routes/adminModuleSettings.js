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
  updatePalaceCredentialsSchema,
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
  isOddsProviderTokenConfigured,
  saveOddsProviderToken,
  pushTokenToOddsProvider,
  getOddsProviderToken,
} from '../services/oddsProviderToken.js';
import {
  getBettingDisplaySettings,
  updateBettingDisplaySettings,
} from '../services/bettingDisplaySettings.js';
import { randomBytes } from 'crypto';

// Palace Casino ayrı (ücretli) bir pakettir — bu kurulumda hiç bulunmayabilir
// (bkz. app.js'deki aynı opsiyonel yükleme deseni).
let palaceModuleSettings = null;
let palaceCredentials = null;
try {
  palaceModuleSettings = await import('../services/palaceModuleSettings.js');
  palaceCredentials = await import('../services/palaceCredentials.js');
} catch {
  // Palace entegrasyonu bu kurulumda mevcut değil.
}

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
      warning: 'Bu secret bir daha gösterilmeyecek — şimdi kaydedin. Değişiklik ANINDA aktif oldu, restart gerekmiyor.',
    });
  } catch (e) { next(e); }
});

// ─── Bahis verisi (odds-data provider) ─────────────────────────────────────
r.get('/odds-provider/settings', async (req, res, next) => {
  try {
    const [settings, display] = await Promise.all([
      getOddsProviderSettings(),
      getBettingDisplaySettings(),
    ]);
    res.json({
      ...settings,
      ...display,
      availableCategories: AVAILABLE_CATEGORIES,
      tokenConfigured: await isOddsProviderTokenConfigured(),
    });
  } catch (e) { next(e); }
});

r.patch('/odds-provider/settings', validate(updateOddsProviderSettingsSchema), async (req, res, next) => {
  try {
    const { prioritySport, priorityCountry, ...providerPatch } = req.body;
    const [updated, display] = await Promise.all([
      updateOddsProviderSettings(providerPatch, req.user?.id),
      (prioritySport !== undefined || priorityCountry !== undefined)
        ? updateBettingDisplaySettings({ prioritySport, priorityCountry }, req.user?.id)
        : getBettingDisplaySettings(),
    ]);
    res.json({
      ...updated,
      ...display,
      availableCategories: AVAILABLE_CATEGORIES,
      tokenConfigured: await isOddsProviderTokenConfigured(),
    });
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.post('/odds-provider/suggest-token', (req, res) => {
  res.json({ suggestedToken: randomBytes(32).toString('hex') });
});

/**
 * Yeni token'ı DB'ye şifreli kaydeder VE odds-provider'ın `/internal/
 * auth-token` ucuna push'lar — restart gerekmez (bkz. services/
 * oddsProviderToken.js). odds-provider o an ayakta değilse push başarısız
 * olur ama kayıt kalır — `pushed:false` + `message` ile admin'e bildirilir,
 * "Yeniden Gönder" (retry-push) ile tekrar denenebilir.
 */
r.post('/odds-provider/token', async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string' || token.length < 16) {
      return res.status(400).json({ error: 'token en az 16 karakter olmalı' });
    }
    await saveOddsProviderToken(token, req.user?.id);
    const pushResult = await pushTokenToOddsProvider(token);
    res.json({ saved: true, ...pushResult });
  } catch (e) { next(e); }
});

r.post('/odds-provider/token/retry-push', async (req, res, next) => {
  try {
    const current = await getOddsProviderToken();
    if (!current) return res.status(400).json({ error: 'Henüz kaydedilmiş bir token yok' });
    const pushResult = await pushTokenToOddsProvider(current);
    res.json({ saved: true, ...pushResult });
  } catch (e) { next(e); }
});

// ─── Palace Casino modül ayarları ──────────────────────────────────────────
// Palace paketi mevcut değilse (bkz. yukarıdaki opsiyonel import) her uç
// tutarlı bir 503 döner — admin panel "modül kurulu değil" olarak gösterebilir.
function requirePalace(req, res, next) {
  if (!palaceModuleSettings || !palaceCredentials) {
    return res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'Palace Casino entegrasyonu bu kurulumda mevcut değil.' });
  }
  next();
}

r.get('/palace/module-settings', requirePalace, async (req, res, next) => {
  try {
    const [language, popularGameCodes] = await Promise.all([
      palaceModuleSettings.getPalaceDefaultLanguage(),
      palaceModuleSettings.getPopularGameCodes(),
    ]);
    res.json({ language, popularGameCodes });
  } catch (e) { next(e); }
});

r.patch('/palace/module-settings', requirePalace, validate(updatePalaceModuleSettingsSchema), async (req, res, next) => {
  try {
    const { language, popularGameCodes } = req.body;
    if (language !== undefined) await palaceModuleSettings.setPalaceDefaultLanguage(language, req.user?.id);
    if (popularGameCodes !== undefined) await palaceModuleSettings.setPopularGameCodes(popularGameCodes, req.user?.id);
    res.json({
      language: language !== undefined ? language : await palaceModuleSettings.getPalaceDefaultLanguage(),
      popularGameCodes: popularGameCodes !== undefined ? popularGameCodes : await palaceModuleSettings.getPopularGameCodes(),
    });
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.get('/palace/credentials', requirePalace, async (req, res, next) => {
  try {
    res.json(await palaceCredentials.getPalaceCredentialsStatus());
  } catch (e) { next(e); }
});

r.patch('/palace/credentials', requirePalace, validate(updatePalaceCredentialsSchema), async (req, res, next) => {
  try {
    res.json(await palaceCredentials.savePalaceCredentials(req.body, req.user?.id));
  } catch (e) { next(e); }
});

export default r;
