/**
 * Modül Ayarları — admin panelinin yeni "in-house oyun provider'ı / odds-data
 * provider'ı / Igames" ayar yüzeyi. `admin.js`'e dokunmadan kendi router'ıyla
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
  updateIgamesModuleSettingsSchema,
  updateIgamesCredentialsSchema,
} from '../validators/admin.js';
import { oddsProviderTokenSchema } from '../validators/adminModuleSettings.js';
import {
  getBettingDisplaySettings,
  updateBettingDisplaySettings,
} from '../services/bettingDisplaySettings.js';
import { randomBytes } from 'crypto';

// Igames Casino ayrı (ücretli) bir pakettir — bu kurulumda hiç bulunmayabilir
// (bkz. app.js'deki aynı opsiyonel yükleme deseni).
let igamesModuleSettings = null;
let igamesCredentials = null;
try {
  igamesModuleSettings = await import('../premium/igames/igamesModuleSettings.js');
  igamesCredentials = await import('../premium/igames/igamesCredentials.js');
} catch {
  // Igames entegrasyonu bu kurulumda mevcut değil.
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
r.post('/odds-provider/token', requireOddsProvider, validate(oddsProviderTokenSchema), async (req, res, next) => {
  try {
    const { token } = req.validated;
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

// ─── Igames Casino modül ayarları ──────────────────────────────────────────
// Igames paketi mevcut değilse (bkz. yukarıdaki opsiyonel import) her uç
// tutarlı bir 503 döner — admin panel "modül kurulu değil" olarak gösterebilir.
function requireIgames(req, res, next) {
  if (!igamesModuleSettings || !igamesCredentials) {
    return res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'Igames Casino entegrasyonu bu kurulumda mevcut değil.' });
  }
  next();
}

r.get('/igames/module-settings', requireIgames, async (req, res, next) => {
  try {
    const [language, popularGameCodes] = await Promise.all([
      igamesModuleSettings.getIgamesDefaultLanguage(),
      igamesModuleSettings.getPopularGameCodes(),
    ]);
    res.json({ language, popularGameCodes });
  } catch (e) { next(e); }
});

r.patch('/igames/module-settings', requireIgames, validate(updateIgamesModuleSettingsSchema), async (req, res, next) => {
  try {
    const { language, popularGameCodes } = req.body;
    if (language !== undefined) await igamesModuleSettings.setIgamesDefaultLanguage(language, req.user?.id);
    if (popularGameCodes !== undefined) await igamesModuleSettings.setPopularGameCodes(popularGameCodes, req.user?.id);
    res.json({
      language: language !== undefined ? language : await igamesModuleSettings.getIgamesDefaultLanguage(),
      popularGameCodes: popularGameCodes !== undefined ? popularGameCodes : await igamesModuleSettings.getPopularGameCodes(),
    });
  } catch (e) {
    if (e.message.includes('olmalı')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

r.get('/igames/credentials', requireIgames, async (req, res, next) => {
  try {
    res.json(await igamesCredentials.getIgamesCredentialsStatus());
  } catch (e) { next(e); }
});

r.patch('/igames/credentials', requireIgames, validate(updateIgamesCredentialsSchema), async (req, res, next) => {
  try {
    res.json(await igamesCredentials.saveIgamesCredentials(req.body, req.user?.id));
  } catch (e) { next(e); }
});

export default r;
