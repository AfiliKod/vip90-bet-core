import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, settleEventSchema, createUserSchema, updateBalanceSchema, updateThemeSchema, updateBrandingSchema } from '../validators/admin.js';
import * as ctrl from '../controllers/admin.js';

const r = Router();
r.use(requireAuth, requireAdmin, auditLog('ADMIN_ACTION'));

r.get('/users',                  ctrl.getUsers);
r.post('/users',                 validate(createUserSchema), ctrl.createUser);
r.patch('/users/:id',            ctrl.updateUser);
r.delete('/users/:id',           ctrl.deleteUser);
r.patch('/users/:id/balance',    validate(updateBalanceSchema), ctrl.updateBalance);
r.get('/users/:id/referrals',    ctrl.getReferrals);
r.get('/users/:id/transactions', ctrl.getUserTransactions);

r.get('/events/archived',    ctrl.getArchivedEvents);
r.post('/events',            validate(createEventSchema), ctrl.createEvent);
r.patch('/events/:id',       ctrl.updateEvent);
r.post('/events/:id/settle', validate(settleEventSchema), ctrl.settle);

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
r.post('/errors/clear',     ctrl.clearErrorLog);

// Tema editörü (A2)
r.get('/theme',   ctrl.getThemeTokens);
r.patch('/theme', validate(updateThemeSchema), ctrl.updateThemeToken);

// Marka kimliği: logo, favicon, site adı, font (A3)
r.get('/branding',   ctrl.getBrandingFields);
r.patch('/branding', validate(updateBrandingSchema), ctrl.updateBrandingField);

// Alarm kanalı ayarları
r.get('/settings/alerts',       ctrl.getAlertSettings);
r.put('/settings/alerts',       ctrl.updateAlertSettings);
r.post('/settings/alerts/test', ctrl.testAlertChannels);

export default r;

