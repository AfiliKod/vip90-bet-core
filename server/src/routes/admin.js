import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, settleEventSchema, createUserSchema, updateBalanceSchema, updateThemeSchema, updateBrandingSchema, updateHomeContentSchema, updateFeaturedGamesSchema, applyThemePresetSchema } from '../validators/admin.js';
import * as ctrl from '../controllers/admin.js';
import modulesAdminRouter from '../controllers/modules.js';
import { timezoneStore } from '../services/timezoneLive.js';
import { createDemoAdminBlock } from '../middleware/demoAdmin.js';
import User from '../models/User.js';

// V1 — demo yönetici yıkıcı işlemleri yapamaz (bayrak DB'den taze okunur)
const blockDemoAdmin = createDemoAdminBlock({
  getUserById: (id) => (id ? User.findById(id).select('isDemoAdmin').lean() : null),
});

const r = Router();
r.use(requireAuth, requireAdmin, auditLog('ADMIN_ACTION'));

// Modül yönetimi (M3) — kendi router'ı, controllers/modules.js'te
r.use('/modules', modulesAdminRouter);

r.get('/users',                  ctrl.getUsers);
r.post('/users',                 validate(createUserSchema), ctrl.createUser);
r.patch('/users/:id',            ctrl.updateUser);
r.delete('/users/:id',           blockDemoAdmin, ctrl.deleteUser);
r.patch('/users/:id/balance',    blockDemoAdmin, validate(updateBalanceSchema), ctrl.updateBalance);
r.get('/users/:id/referrals',    ctrl.getReferrals);
r.get('/users/:id/transactions', ctrl.getUserTransactions);

r.get('/events/archived',    ctrl.getArchivedEvents);
r.post('/events',            validate(createEventSchema), ctrl.createEvent);
r.patch('/events/:id',       ctrl.updateEvent);
r.post('/events/:id/settle', blockDemoAdmin, validate(settleEventSchema), ctrl.settle);

r.get('/stats',       ctrl.getStats);
r.get('/tasks',       ctrl.getTasks);
r.patch('/tasks/:id', ctrl.updateTask);

r.get('/casino/stats',            ctrl.getCasinoStats);
r.get('/users/:id/casino-rounds', ctrl.getUserCasinoRounds);

// Palace Casino
r.get('/palace/agent/info',       ctrl.getPalaceAgentInfo);
r.post('/palace/user/create',     ctrl.createPalaceUser);
r.post('/palace/game/launch',     ctrl.launchPalaceGame);
r.post('/palace/game/list',       ctrl.getPalaceGameList);

// Palace Casino (admin operations)
r.get('/palace/test-users',        ctrl.getPalaceTestUsers);
r.post('/palace/withdraw-test-users', ctrl.withdrawPalaceTestUsers);
r.post('/palace/rtp',              ctrl.setPalaceRtp);
r.post('/palace/bonus/start',       ctrl.startPalaceBonusCall);
r.post('/palace/bonus/cancel',      ctrl.cancelPalaceBonusCall);
r.get('/palace/bonus/config',       ctrl.getPalaceBonusCallConfig);
r.get('/palace/summary',            ctrl.getPalaceSummary);

// Error log (admin monitoring)
r.get('/errors/recent',     ctrl.getRecentErrors);
r.get('/errors/status',     ctrl.getErrorLogStatus);
r.post('/errors/clear',     blockDemoAdmin, ctrl.clearErrorLog);

// Tema editörü (A2)
r.get('/theme',   ctrl.getThemeTokens);
r.patch('/theme', validate(updateThemeSchema), ctrl.updateThemeToken);

// Hazır tema paketleri (A6)
r.get('/theme/presets',       ctrl.getThemePresets);
r.post('/theme/apply-preset', validate(applyThemePresetSchema), ctrl.applyThemePreset);

// Marka kimliği: logo, favicon, site adı, font (A3)
r.get('/branding',   ctrl.getBrandingFields);
r.patch('/branding', validate(updateBrandingSchema), ctrl.updateBrandingField);

// Sayfa/blok düzenleyici: ana sayfa bölüm sırası + banner'lar (A4)
r.get('/pages/home',   ctrl.getHomeContentAdmin);
r.patch('/pages/home', validate(updateHomeContentSchema), ctrl.updateHomeContent);

// Oyun vitrini: öne çıkan oyunlar, sırayla (A5)
r.get('/games/featured',   ctrl.getFeaturedGamesAdmin);
r.patch('/games/featured', validate(updateFeaturedGamesSchema), ctrl.updateFeaturedGames);

// Alarm kanalı ayarları
r.get('/settings/alerts',       ctrl.getAlertSettings);
r.put('/settings/alerts',       ctrl.updateAlertSettings);
r.post('/settings/alerts/test', ctrl.testAlertChannels);

// U5 — operatör saat dilimi ayarı (panelden)
r.get('/settings/timezone',      async (req,res,next) => { try { res.json({ timezone: await timezoneStore.get() }); } catch(e){ next(e); } });
r.put('/settings/timezone',      async (req,res,next) => { try { const tz = await timezoneStore.set(String(req.body?.timezone||''), req.user?.id); res.json({ timezone: tz }); } catch(e){ next(e); } });

export default r;

