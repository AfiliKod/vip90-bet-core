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
  getBettingDisplaySettings,
  updateBettingDisplaySettings,
} from '../services/bettingDisplaySettings.js';
import { randomBytes } from 'crypto';

// Palace Casino ayrı (ücretli) bir pakettir — bu kurulumda hiç bulunmayabilir
// (bkz. app.js'deki aynı opsiyonel yükleme deseni).
let palaceModuleSettings = null;
let palaceCredentials = null;
try {
  palaceModuleSettings = await import('../premium/palace/palaceModuleSettings.js');
  palaceCredentials = await import('../premium/palace/palaceCredentials.js');
} catch {
  // Palace entegrasyonu bu kurulumda mevcut değil.
}

// In-house oyun provider'ı da ayrı (ücretli) bir pakettir — aynı desen.
let inhouseProviderSettings = null;
try {
  inhouseProviderSettings = await import('../premium/inhouse-provider/inhouseProviderSettings.js');
} catch {
  // In-house oyun provider'ı bu kurulumda mevcut değil.
}

// Bahis oran sağlayıcı (odds-provider) bağlantı ayarları da ayrı (ücretli)
// bir pakettir — aynı desen. bettingDisplaySettings.js (öncelik/sıralama
// gibi salt görüntüleme tercihleri) çekirdekte kalır, etkilenmez.
let oddsProviderSettings = null;
let oddsProviderToken = null;
try {
  oddsProviderSettings = await import('../premium/betting/oddsProviderSettings.js');
  oddsProviderToken = await import('../premium/betting/oddsProviderToken.js');
} catch {
  // Bahis oran sağlayıcı entegrasyonu bu kurulumda mevcut değil.
}

const r = Router();
r.use(requireAuth, requireAdmin, auditLog('ADMIN_ACTION'));

// ─── In-house oyunlar provider'ı ───────────────────────────────────────────
function requireInhouseProvider(req, res, next) {
  if (!inhouseProviderSettings) {
    return res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'In-house oyun provider\'ı bu kurulumda mevcut değil.' });
  }
  next();
}

r.get('/inhouse-provider/settings', requireInhouseProvider, async (req, res, next) => {
  try {
    res.json(await inhouseProviderSettings.getInhouseProviderSettings());
  } catch (e) { next(e); }
});

r.patch('/inhouse-provider/settings', requireInhouseProvider, validate(updateInhouseProviderSettingsSchema), async (req, res, next) => {
  try {
    res.json(await inhouseProviderSettings.updateInhouseProviderSettings(req.body));
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.post('/inhouse-provider/rotate-key', requireInhouseProvider, async (req, res, next) => {
  try {
    const { apiKeyId, apiKeySecret } = await inhouseProviderSettings.rotateInhouseProviderApiKey();
    res.json({
      apiKeyId,
      apiKeySecret,
      warning: 'Bu secret bir daha gösterilmeyecek — şimdi kaydedin. Değişiklik ANINDA aktif oldu, restart gerekmiyor.',
    });
  } catch (e) { next(e); }
});

// ─── Bahis verisi (odds-data provider) ─────────────────────────────────────
// Paket yoksa (bkz. yukarıdaki opsiyonel import) her uç tutarlı bir 503 döner.
function requireOddsProvider(req, res, next) {
  if (!oddsProviderSettings || !oddsProviderToken) {
    return res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'Bahis oran sağlayıcı entegrasyonu bu kurulumda mevcut değil.' });
  }
  next();
}

r.get('/odds-provider/settings', requireOddsProvider, async (req, res, next) => {
  try {
    const [settings, display] = await Promise.all([
      oddsProviderSettings.getOddsProviderSettings(),
      getBettingDisplaySettings(),
    ]);
    res.json({
      ...settings,
      ...display,
      availableCategories: oddsProviderSettings.AVAILABLE_CATEGORIES,
      tokenConfigured: await oddsProviderToken.isOddsProviderTokenConfigured(),
    });
  } catch (e) { next(e); }
});

r.patch('/odds-provider/settings', requireOddsProvider, validate(updateOddsProviderSettingsSchema), async (req, res, next) => {
  try {
    const { prioritySport, priorityCountry, ...providerPatch } = req.body;
    const [updated, display] = await Promise.all([
      oddsProviderSettings.updateOddsProviderSettings(providerPatch, req.user?.id),
      (prioritySport !== undefined || priorityCountry !== undefined)
        ? updateBettingDisplaySettings({ prioritySport, priorityCountry }, req.user?.id)
        : getBettingDisplaySettings(),
    ]);
    res.json({
      ...updated,
      ...display,
      availableCategories: oddsProviderSettings.AVAILABLE_CATEGORIES,
      tokenConfigured: await oddsProviderToken.isOddsProviderTokenConfigured(),
    });
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.post('/odds-provider/suggest-token', requireOddsProvider, (req, res) => {
  res.json({ suggestedToken: randomBytes(32).toString('hex') });
});

/**
 * Yeni token'ı DB'ye şifreli kaydeder VE odds-provider'ın `/internal/
 * auth-token` ucuna push'lar — restart gerekmez (bkz. services/
 * oddsProviderToken.js). odds-provider o an ayakta değilse push başarısız
 * olur ama kayıt kalır — `pushed:false` + `message` ile admin'e bildirilir,
 * "Yeniden Gönder" (retry-push) ile tekrar denenebilir.
 */
r.post('/odds-provider/token', requireOddsProvider, async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string' || token.length < 16) {
      return res.status(400).json({ error: 'token en az 16 karakter olmalı' });
    }
    await oddsProviderToken.saveOddsProviderToken(token, req.user?.id);
    const pushResult = await oddsProviderToken.pushTokenToOddsProvider(token);
    res.json({ saved: true, ...pushResult });
  } catch (e) { next(e); }
});

r.post('/odds-provider/token/retry-push', requireOddsProvider, async (req, res, next) => {
  try {
    const current = await oddsProviderToken.getOddsProviderToken();
    if (!current) return res.status(400).json({ error: 'Henüz kaydedilmiş bir token yok' });
    const pushResult = await oddsProviderToken.pushTokenToOddsProvider(current);
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
