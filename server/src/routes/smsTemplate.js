/**
 * SMS Gateway yönetim uçları — `routes/admin.js` içinde `/sms` altına
 * mount edilir, yani istemciden `/api/admin/sms/*` adresiyle erişilir.
 *
 * Yetkiler mevcut ikili eşleşmeyi kullanır:
 *   okuma  → admin:settings:read  (şablonlar/yönetim ayarları)
 *   yazma  → admin:settings:write (şablon CRUD, ayar kaydı, gönderim)
 *
 * Gönderim `admin:settings:write` gerektirir: SMS maliyeti para ve
 * oyuncunun telefonuna giden geri alınamaz bir iletişimdir.
 *
 * Dizin sırası önemli: `/settings` ve `/templates/:id/send` gibi literal
 * yollar `/:id` deseninden ÖNCE bildirilir.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import { validate } from '../middleware/validate.js';
import handlers from '../controllers/smsTemplate.js';
import {
  createSmsTemplateSchema,
  updateSmsTemplateSchema,
  sendSmsSchema,
  updateSmsSettingsSchema,
  createSmsSenderSchema,
  updateSmsSenderSchema,
} from '../validators/smsTemplate.js';

const r = Router();

const read = [requireAuth, requireAdmin, requirePermission('admin:settings:read')];
const write = [requireAuth, requireAdmin, requirePermission('admin:settings:write')];

// ── Gateway ayarları (Twilio kimlik bilgileri) ──
r.get('/settings', ...read, handlers.settingsStatus);
r.patch('/settings', ...write, validate(updateSmsSettingsSchema), handlers.settingsUpdate);
r.post('/settings/test', ...write, handlers.settingsTest);

// ── Gönderici kaydı (numara + ülke/mevzuat onayı) ──
// `/senders/gate` LITERAL yol olduğu için `/senders/:id`'den önce bildirilir.
r.get('/senders/gate', ...read, handlers.senderGate);
r.get('/senders', ...read, handlers.senderList);
r.post('/senders', ...write, validate(createSmsSenderSchema), handlers.senderCreate);
r.patch('/senders/:id', ...write, validate(updateSmsSenderSchema), handlers.senderUpdate);
r.delete('/senders/:id', ...write, handlers.senderRemove);

// ── Gönderim günlüğü ──
// NOT: `validate()` yalnızca `req.body` ayrıştırır (bkz. middleware/validate.js),
// query parametreleri elle doğrulanır — bu yüzden burada validate() YOK.
r.get('/logs', ...read, handlers.logs);

// ── Şablon CRUD + gönderim ──
r.get('/templates', ...read, handlers.list);
r.post('/templates', ...write, validate(createSmsTemplateSchema), handlers.create);
r.post('/templates/:id/send', ...write, validate(sendSmsSchema), handlers.send);
r.patch('/templates/:id', ...write, validate(updateSmsTemplateSchema), handlers.update);
r.delete('/templates/:id', ...write, handlers.remove);

export default r;