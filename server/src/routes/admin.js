import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, settleEventSchema, createUserSchema, updateBalanceSchema, updateThemeSchema, updateBrandingSchema, updateHomeContentSchema, updateFeaturedGamesSchema, applyThemePresetSchema, updateGameSettingsSchema, simulateRtpSchema, updateCurrencySchema, updateTimezoneSchema, updateDefaultLocaleSchema, createRoleSchema, updateRoleSchema, assignRoleSchema, upsertVipLevelSchema, upsertPromotionSchema, createBotSchema, updateBotSchema, upsertStaticPageSchema, toggleStaticPageSchema, updateFakeWinnersSchema, updateUserAdminSchema, updateTaskSchema, createIgamesUserSchema, launchIgamesGameSchema, setIgamesRtpSchema, startIgamesBonusCallSchema, cancelIgamesBonusCallSchema, createFreeRoundSchema, cancelFreeRoundSchema, updateAlertSettingsSchema, updateKycSettingsSchema, approveKycSubmissionSchema, rejectKycSubmissionSchema, updateCryptoSettingsSchema, updateReferralSettingsSchema, updateSlikairSettingsSchema, updateEmailSettingsSchema } from '../validators/admin.js';
import * as ctrl from '../controllers/admin.js';
import modulesAdminRouter from '../controllers/modules.js';
import reconciliationRouter from './reconciliation.js';
import agentRouter from './agent.js';
import auditRouter from './audit.js';
import healthRouter from './health.js';
import { timezoneStore } from '../services/timezoneLive.js';
import { localeStore } from '../services/localeLive.js';
import { SUPPORTED_LOCALES } from '../services/locale.js';
import { createDemoAdminBlock } from '../middleware/demoAdmin.js';
import { requirePermission } from '../services/permissions.js';
import User from '../models/User.js';
import { createSlikairSettingsHandlers, createEmailSettingsHandlers } from '../controllers/integrationSettings.js';
import { createModuleGate } from '../middleware/moduleGate.js';
import { isModuleUsable } from '../services/licensing/index.js';
import { emailTestLimiter } from '../middleware/rateLimit.js';
import seoAdminRouter from './seoAdmin.js';

// V1 — demo yönetici yıkıcı işlemleri yapamaz (bayrak DB'den taze okunur)
const blockDemoAdmin = createDemoAdminBlock({
  getUserById: (id) => (id ? User.findById(id).select('isDemoAdmin').lean() : null),
});

const r = Router();
r.use(requireAuth, requireAdmin, auditLog('ADMIN_ACTION'));

// Modül yönetimi (M3) — kendi router'ı, controllers/modules.js'te
r.use('/modules', modulesAdminRouter);

// Uzlaşma çerçevesi (Phase 2B)
r.use('/reconciliation', reconciliationRouter);

// Agent sistemi (Phase 2, Task 2.1) — model+service zaten vardı, HTTP API burada
r.use('/agents', agentRouter);

// Audit trail (Phase 2D)
r.use('/audit', auditRouter);

// Health monitoring (Phase 3K)
r.use('/health', healthRouter);

// Player segmentation (Phase 3J)
import playerSegmentRouter from './playerSegment.js';
r.use('/segments', playerSegmentRouter);

// Multi-currency (Phase 3G)
import multiCurrencyRouter from './multiCurrency.js';
r.use('/currencies', multiCurrencyRouter);

// Multi-brand (Phase 3H)
import multiBrandRouter from './multiBrand.js';
r.use('/brands', multiBrandRouter);

// Multi-jurisdiction (Phase 3I)
import multiJurisdictionRouter from './multiJurisdiction.js';
r.use('/jurisdictions', multiJurisdictionRouter);

r.get('/users',                  requirePermission('admin:users:read'), ctrl.getUsers);
r.get('/users/facets',           requirePermission('admin:users:read'), ctrl.getUsersFacets);
r.get('/users/kpis',             requirePermission('admin:users:read'), ctrl.getUsersKpis);
r.post('/users',                 requirePermission('admin:users:write'), validate(createUserSchema), ctrl.createUser);
r.patch('/users/:id',            requirePermission('admin:users:write'), validate(updateUserAdminSchema), ctrl.updateUser);
r.delete('/users/:id',           requirePermission('admin:users:write'), blockDemoAdmin, ctrl.deleteUser);
r.patch('/users/:id/balance',    requirePermission('admin:users:balance'), blockDemoAdmin, validate(updateBalanceSchema), ctrl.updateBalance);
r.get('/users/:id/referrals',    requirePermission('admin:users:read'), ctrl.getReferrals);
r.get('/users/:id/referral-tree', requirePermission('admin:users:read'), ctrl.getReferralTree); // O2 — 3 seviye salt-okunur ağaç
r.get('/users/:id/transactions', requirePermission('admin:transactions:read'), ctrl.getUserTransactions);

r.get('/events/archived',    requirePermission('admin:events:read'), ctrl.getArchivedEvents);
r.post('/events',            requirePermission('admin:events:write'), validate(createEventSchema), ctrl.createEvent);
r.patch('/events/:id',       requirePermission('admin:events:write'), ctrl.updateEvent);
r.post('/events/:id/settle', requirePermission('admin:events:settle'), blockDemoAdmin, validate(settleEventSchema), ctrl.settle);

r.get('/stats',       requirePermission('admin:reports:read'), ctrl.getStats);
r.get('/activity',    requirePermission('admin:activity:read'), ctrl.listActivity);
// F2 — sidebar rozetleri + dashboard kuyruk kartları bu tek sayıyı okur.
r.get('/queues/counts', requirePermission('admin:activity:read'), ctrl.getAdminQueueCounts);
r.get('/demo-data/status',           requirePermission('admin:demo-data:manage'), ctrl.getDemoDataStatus);
r.post('/demo-data/:category/load',  requirePermission('admin:demo-data:manage'), ctrl.loadDemoDataCategory);
r.post('/demo-data/:category/clear', requirePermission('admin:demo-data:manage'), ctrl.clearDemoDataCategory);
r.post('/demo-data/live/start', requirePermission('admin:demo-data:manage'), ctrl.startDemoDataLive);
r.post('/demo-data/live/stop',  requirePermission('admin:demo-data:manage'), ctrl.stopDemoDataLive);
r.get('/tasks',       requirePermission('admin:casino:read'), ctrl.getTasks);
r.patch('/tasks/:id', requirePermission('admin:casino:write'), validate(updateTaskSchema), ctrl.updateTask);

r.get('/casino/stats',            requirePermission('admin:casino:read'), ctrl.getCasinoStats);
r.get('/users/:id/casino-rounds', requirePermission('admin:casino:read'), ctrl.getUserCasinoRounds);

// Igames Casino
r.get('/igames/agent/info',       requirePermission('admin:casino:read'), ctrl.getIgamesAgentInfo);
r.post('/igames/user/create',     requirePermission('admin:casino:write'), validate(createIgamesUserSchema), ctrl.createIgamesUser);
r.post('/igames/game/launch',     requirePermission('admin:casino:write'), validate(launchIgamesGameSchema), ctrl.launchIgamesGame);
r.post('/igames/game/list',       requirePermission('admin:casino:read'), ctrl.getIgamesGameList);

// Igames Casino (admin operations)
r.get('/igames/test-users',        requirePermission('admin:casino:read'), ctrl.getIgamesTestUsers);
r.post('/igames/withdraw-test-users', requirePermission('admin:casino:write'), ctrl.withdrawIgamesTestUsers);
r.post('/igames/rtp',              requirePermission('admin:casino:rtp'), blockDemoAdmin, validate(setIgamesRtpSchema), ctrl.setIgamesRtp);
r.get('/igames/online-plays',      requirePermission('admin:casino:read'), ctrl.getIgamesOnlinePlays);
r.get('/igames/promo/config',       requirePermission('admin:casino:read'), ctrl.getPromoConfig);
r.get('/igames/promo/grants',       requirePermission('admin:casino:read'), ctrl.listPromoGrants);
r.post('/igames/bonus/start',       requirePermission('admin:casino:bonus'), blockDemoAdmin, validate(startIgamesBonusCallSchema), auditLog('CASINO_PROMO_GRANT', { captureAfter: true }), ctrl.startIgamesBonusCall);
r.post('/igames/bonus/cancel',      requirePermission('admin:casino:bonus'), blockDemoAdmin, validate(cancelIgamesBonusCallSchema), auditLog('CASINO_PROMO_CANCEL', { captureAfter: true }), ctrl.cancelIgamesBonusCall);
r.post('/igames/freeround/create',  requirePermission('admin:casino:bonus'), blockDemoAdmin, validate(createFreeRoundSchema), auditLog('CASINO_PROMO_GRANT', { captureAfter: true }), ctrl.createFreeRound);
r.post('/igames/freeround/cancel',  requirePermission('admin:casino:bonus'), blockDemoAdmin, validate(cancelFreeRoundSchema), auditLog('CASINO_PROMO_CANCEL', { captureAfter: true }), ctrl.cancelFreeRound);
r.get('/igames/bonus/config',       requirePermission('admin:casino:read'), ctrl.getIgamesBonusCallConfig);
r.get('/igames/summary',            requirePermission('admin:casino:read'), ctrl.getIgamesSummary);

// Error log (admin monitoring)
r.get('/errors/recent',     requirePermission('admin:audit:read'), ctrl.getRecentErrors);
r.get('/errors/status',     requirePermission('admin:audit:read'), ctrl.getErrorLogStatus);
r.post('/errors/clear',     requirePermission('admin:audit:read'), blockDemoAdmin, ctrl.clearErrorLog);

// Tema editörü (A2)
r.get('/theme',   requirePermission('admin:theme:read'), ctrl.getThemeTokens);
r.patch('/theme', requirePermission('admin:theme:write'), validate(updateThemeSchema), ctrl.updateThemeToken);

// Hazır tema paketleri (A6)
r.get('/theme/presets',       requirePermission('admin:theme:read'), ctrl.getThemePresets);
r.post('/theme/apply-preset', requirePermission('admin:theme:write'), validate(applyThemePresetSchema), ctrl.applyThemePreset);

// Marka kimliği: logo, favicon, site adı, font (A3)
r.get('/branding',   requirePermission('admin:theme:read'), ctrl.getBrandingFields);
r.patch('/branding', requirePermission('admin:theme:write'), validate(updateBrandingSchema), ctrl.updateBrandingField);

// Sayfa/blok düzenleyici: ana sayfa bölüm sırası + banner'lar (A4)
r.get('/pages/home',   requirePermission('admin:theme:read'), ctrl.getHomeContentAdmin);
r.patch('/pages/home', requirePermission('admin:theme:write'), validate(updateHomeContentSchema), ctrl.updateHomeContent);

// Oyun vitrini: öne çıkan oyunlar, sırayla (A5)
r.get('/games/featured',   requirePermission('admin:casino:read'), ctrl.getFeaturedGamesAdmin);
r.patch('/games/featured', requirePermission('admin:casino:write'), validate(updateFeaturedGamesSchema), ctrl.updateFeaturedGames);

// Oyun limitleri, RTP ve house edge ayarları (O6)
r.get('/game-settings',              requirePermission('admin:casino:read'), ctrl.getGameSettings);
r.patch('/game-settings/:gameId',    requirePermission('admin:casino:write'), blockDemoAdmin, validate(updateGameSettingsSchema), ctrl.updateGameSettings);
r.post('/game-settings/:gameId/simulate-rtp', requirePermission('admin:casino:rtp'), validate(simulateRtpSchema), ctrl.simulateGameRtp);

// Alarm kanalı ayarları
r.get('/settings/alerts',       requirePermission('admin:settings:read'), ctrl.getAlertSettings);
r.put('/settings/alerts',       requirePermission('admin:settings:write'), validate(updateAlertSettingsSchema), ctrl.updateAlertSettings);
r.post('/settings/alerts/test', requirePermission('admin:settings:write'), ctrl.testAlertChannels);

// Slikair kimlik bilgileri (DB şifreli > env) — Modules sayfasındaki Slikair gövdesi
const slikairSettings = createSlikairSettingsHandlers();
r.get('/slikair/settings', requirePermission('admin:settings:read'), slikairSettings.get);
r.put('/slikair/settings', requirePermission('admin:settings:write'), validate(updateSlikairSettingsSchema), slikairSettings.update);

// E-posta (SMTP) ayarları (şifre DB'de şifreli, boş alanlar env'den) + test e-postası
const emailSettings = createEmailSettingsHandlers();
r.get('/settings/email',      requirePermission('admin:settings:read'), emailSettings.get);
r.put('/settings/email',      requirePermission('admin:settings:write'), validate(updateEmailSettingsSchema), emailSettings.update);
// SEO ayarları (başlık/meta/OG/doğrulama/analytics) — site <head>'ine enjekte edilir
r.use('/settings/seo', seoAdminRouter);
r.post('/settings/email/test', requirePermission('admin:settings:write'), emailTestLimiter, emailSettings.test);

// U5 — operatör saat dilimi ayarı (panelden)
r.get('/settings/timezone',      requirePermission('admin:settings:read'), async (req,res,next) => { try { res.json({ timezone: await timezoneStore.get() }); } catch(e){ next(e); } });
r.put('/settings/timezone',      requirePermission('admin:settings:write'), validate(updateTimezoneSchema), async (req,res,next) => { try { const tz = await timezoneStore.set(req.validated.timezone, req.user?.id); res.json({ timezone: tz }); } catch(e){ next(e); } });
r.get('/settings/default-locale', requirePermission('admin:settings:read'), async (req,res,next) => { try { res.json({ locale: await localeStore.get(), supportedLocales: SUPPORTED_LOCALES }); } catch(e){ next(e); } });
r.put('/settings/default-locale', requirePermission('admin:settings:write'), validate(updateDefaultLocaleSchema), async (req,res,next) => { try { const locale = await localeStore.set(req.validated.locale, req.user?.id); res.json({ locale }); } catch(e){ next(e); } });

// U4 — para birimi (servis katmanı zaten vardı, yalnızca admin ucu ekleniyor)
r.get('/currency',  requirePermission('admin:settings:read'), ctrl.getCurrencySettings);
r.put('/currency',  requirePermission('admin:settings:write'), blockDemoAdmin, validate(updateCurrencySchema), ctrl.updateCurrencySettings);

// O4 — kademeli yönetici yetkileri (rol/izin yönetimi — bkz. controllers/admin.js'teki not)
r.get('/roles',                    requirePermission('admin:roles:read'), ctrl.listRoles);
r.post('/roles',                   requirePermission('admin:roles:write'), blockDemoAdmin, validate(createRoleSchema), ctrl.createRoleHandler);
r.put('/roles/:id',                requirePermission('admin:roles:write'), blockDemoAdmin, validate(updateRoleSchema), ctrl.updateRoleHandler);
r.delete('/roles/:id',             requirePermission('admin:roles:write'), blockDemoAdmin, ctrl.deleteRoleHandler);
r.get('/permissions',              requirePermission('admin:roles:read'), ctrl.listPermissions);
// Oturumdaki admin'in kendi izinleri — UI'ın yetki kontrolü için.
// requirePermission YOK: her admin kendi izinini sorabilmeli, yoksa panel
// kilitli kalır ve hangi yetkiyi kaçırdığını anlayamayız.
r.get('/me/permissions',           ctrl.getMyPermissions);
r.post('/users/:id/roles',         requirePermission('admin:roles:write'), blockDemoAdmin, validate(assignRoleSchema), ctrl.assignUserRole);
r.delete('/users/:id/roles/:roleId', requirePermission('admin:roles:write'), blockDemoAdmin, ctrl.removeUserRole);

// Kampanyalar/promosyonlar (Promotion) — admin CRUD
r.get('/promotions',        requirePermission('admin:settings:read'), ctrl.listPromotions);
r.post('/promotions',       requirePermission('admin:settings:write'), blockDemoAdmin, validate(upsertPromotionSchema), ctrl.savePromotion);
r.delete('/promotions/:id', requirePermission('admin:settings:write'), blockDemoAdmin, ctrl.deletePromotion);

// O1 — VIP/seviye programı
r.get('/vip-levels',        requirePermission('admin:settings:read'), ctrl.listVipLevels);
r.post('/vip-levels',       requirePermission('admin:settings:write'), blockDemoAdmin, validate(upsertVipLevelSchema), ctrl.saveVipLevel);
r.delete('/vip-levels/:level', requirePermission('admin:settings:write'), blockDemoAdmin, ctrl.removeVipLevel);

// P3 — bot oyuncular (User koleksiyonunda isBot:true, gerçek oyun route'larını kullanır)
r.get('/bots',              requirePermission('admin:settings:read'), ctrl.listBots);
r.post('/bots',              requirePermission('admin:settings:write'), blockDemoAdmin, validate(createBotSchema), ctrl.createBotHandler);
r.get('/bots/:id',           requirePermission('admin:settings:read'), ctrl.getBotHandler);
r.patch('/bots/:id',         requirePermission('admin:settings:write'), blockDemoAdmin, validate(updateBotSchema), ctrl.updateBotHandler);
r.delete('/bots/:id',        requirePermission('admin:settings:write'), blockDemoAdmin, ctrl.deleteBotHandler);
r.post('/bots/start-all',    requirePermission('admin:settings:write'), blockDemoAdmin, ctrl.startAllBotsHandler);
r.post('/bots/stop-all',     requirePermission('admin:settings:write'), blockDemoAdmin, ctrl.stopAllBotsHandler);

// Son Kazananlar simülasyonu (kozmetik — gerçek User/bakiye kullanmaz, bkz. services/fakeWinners.js)
r.get('/fake-winners',   requirePermission('admin:settings:read'), ctrl.getFakeWinnersSettings);
r.put('/fake-winners',   requirePermission('admin:settings:write'), blockDemoAdmin, validate(updateFakeWinnersSchema), ctrl.updateFakeWinnersSettings);

// Footer/statik sayfa yönetimi (Hakkımızda/Kariyer/Basın/İletişim/Yasal/Sorumlu Oyun)
r.get('/static-pages',              requirePermission('admin:settings:read'), ctrl.listStaticPages);
r.put('/static-pages/:slug',        requirePermission('admin:settings:write'), blockDemoAdmin, validate(upsertStaticPageSchema), ctrl.upsertStaticPage);
r.patch('/static-pages/:slug/toggle', requirePermission('admin:settings:write'), blockDemoAdmin, validate(toggleStaticPageSchema), ctrl.toggleStaticPage);

// KYC Kimlik Doğrulama — admin ayarları ve inceleme
r.get('/kyc-settings', requirePermission('admin:kyc:read'), ctrl.getKycSettings);
r.put('/kyc-settings', requirePermission('admin:kyc:approve'), validate(updateKycSettingsSchema), ctrl.updateKycSettings);
r.post('/kyc-settings/test', requirePermission('admin:kyc:approve'), ctrl.testKycConnection);
r.get('/kyc/submissions', requirePermission('admin:kyc:read'), ctrl.getKycSubmissions);
r.get('/kyc/stats', requirePermission('admin:kyc:read'), ctrl.getKycStatsAdmin);
r.get('/kyc/submissions/:id', requirePermission('admin:kyc:read'), ctrl.getKycSubmissionDetail);
r.post('/kyc/submissions/:id/approve', requirePermission('admin:kyc:approve'), validate(approveKycSubmissionSchema), ctrl.approveKycSubmission);
r.post('/kyc/submissions/:id/reject', requirePermission('admin:kyc:approve'), validate(rejectKycSubmissionSchema), ctrl.rejectKycSubmission);
r.post('/kyc/submissions/:id/under-review', requirePermission('admin:kyc:approve'), ctrl.setKycSubmissionUnderReview);

// Crypto Ödeme Ağ Geçidi — admin ayarları ve onay/reddet
r.get('/crypto/pending-deposits',    requirePermission('admin:transactions:read'), ctrl.getCryptoPendingDeposits);
r.get('/crypto/pending-withdrawals', requirePermission('admin:transactions:read'), ctrl.getCryptoPendingWithdrawals);
r.get('/crypto/all-deposits',        requirePermission('admin:transactions:read'), ctrl.getAllCryptoDeposits);
r.get('/crypto/all-withdrawals',     requirePermission('admin:transactions:read'), ctrl.getAllCryptoWithdrawals);
r.get('/crypto/stats',               requirePermission('admin:transactions:read'), ctrl.getCryptoStats);
r.get('/bank/stats',                 requirePermission('admin:transactions:read'), ctrl.getBankStats);
r.get('/crypto/tx-detail/:id',       requirePermission('admin:transactions:read'), ctrl.getCryptoTxDetail);
r.get('/crypto/tx-verify/:txHash',   requirePermission('admin:transactions:read'), ctrl.verifyCryptoTx);
r.put('/crypto/settings',            requirePermission('admin:settings:write'), validate(updateCryptoSettingsSchema), ctrl.updateCryptoSettings);
r.post('/crypto/deposits/:id/approve', requirePermission('admin:transactions:write'), ctrl.approveCryptoDeposit);
r.post('/crypto/deposits/:id/reject',  requirePermission('admin:transactions:write'), ctrl.rejectCryptoDeposit);
r.post('/crypto/withdrawals/:id/approve', requirePermission('admin:transactions:write'), ctrl.approveCryptoWithdrawal);
r.post('/crypto/withdrawals/:id/reject',  requirePermission('admin:transactions:write'), ctrl.rejectCryptoWithdrawal);

// Referans Komisyonu Ayarları
r.get('/referral/settings',  requirePermission('admin:referral:read'), ctrl.getReferralSettings);
r.put('/referral/settings',  requirePermission('admin:referral:rates'), validate(updateReferralSettingsSchema), ctrl.updateReferralSettings);

// Slikair Payment Gateway
import * as slikairCtrl from '../controllers/slikairController.js';
import { slikairAdminPayoutSchema } from '../validators/slikair.js';
r.get('/slikair/payments',     requirePermission('admin:transactions:read'), slikairCtrl.getPayments);
r.get('/slikair/payments/:id', requirePermission('admin:transactions:read'), slikairCtrl.getPaymentDetail);
r.get('/slikair/payouts',      requirePermission('admin:transactions:read'), slikairCtrl.getPayouts);
r.get('/slikair/payouts/:id',  requirePermission('admin:transactions:read'), slikairCtrl.getPayoutDetail);
r.post('/slikair/payouts',     requirePermission('admin:transactions:write'), createModuleGate({ isUsable: isModuleUsable, moduleId: 'slikair-payment' }), validate(slikairAdminPayoutSchema), slikairCtrl.initiatePayout);
r.get('/slikair/stats',        requirePermission('admin:transactions:read'), slikairCtrl.getStats);

export default r;

