/**
 * Entegrasyon ayar uçları: Slikair kimlik bilgileri ve SMTP.
 * Handler fabrikaları — store/gönderici enjekte edilir (testte mock).
 * Gizli alanlar yanıtta hiçbir zaman düz dönmez (maskeli).
 */
import { createError } from '../middleware/error.js';
import { slikairConfig } from '../config/slikairConfig.js';
import { emailConfig } from '../config/emailConfig.js';
import { sendTestEmail } from '../services/email.js';
import User from '../models/User.js';

function settingsHandlers(store, afterUpdate = () => {}) {
  return {
    async get(req, res, next) {
      try {
        res.json({ settings: await store.getAdminView() });
      } catch (e) { next(e); }
    },
    async update(req, res, next) {
      try {
        const { clear = [], ...patch } = req.validated ?? req.body ?? {};
        if ('secure' in patch) patch.secure = patch.secure === true ? 'true' : patch.secure === false ? 'false' : patch.secure;
        if ('gatewayEnabled' in patch) patch.gatewayEnabled = patch.gatewayEnabled === true ? 'true' : patch.gatewayEnabled === false ? 'false' : patch.gatewayEnabled;
        if ('port' in patch) patch.port = String(patch.port);
        try {
          await store.update(patch, { clear, adminId: req.user?.id });
        } catch (e) {
          // Şifreleme anahtarı (OPERATOR_SECRET_ENCRYPTION_KEY) yoksa gizli alan kaydedilemez.
          if (/OPERATOR_SECRET_ENCRYPTION_KEY/.test(e.message)) {
            throw createError(500, 'ENCRYPTION_KEY_MISSING', 'Gizli alanları saklamak için sunucuda şifreleme anahtarı tanımlı olmalı');
          }
          throw e;
        }
        await afterUpdate();
        res.json({ settings: await store.getAdminView() });
      } catch (e) { next(e); }
    },
  };
}

export function createSlikairSettingsHandlers({ store = slikairConfig } = {}) {
  return settingsHandlers(store);
}

export function createEmailSettingsHandlers({
  store = emailConfig,
  sendTest = sendTestEmail,
  getAdminEmail = async id => (await User.findById(id).select('email').lean())?.email,
} = {}) {
  return {
    ...settingsHandlers(store),
    async test(req, res, next) {
      try {
        // "Test / send" paneli: alıcı gövdeden gelirse ona gönderilir
        // (validate + admin:settings:write ile korumalı), gelmezse eskisi
        // gibi yöneticinin kendi adresine.
        const requested = typeof req.validated?.to === 'string' ? req.validated.to.trim() : '';
        const to = requested || await getAdminEmail(req.user?.id);
        if (!to) throw createError(400, 'NO_ADMIN_EMAIL', 'Yönetici hesabında e-posta adresi yok');
        try {
          await sendTest(to);
        } catch (e) {
          if (e.code === 'SMTP_NOT_CONFIGURED') throw createError(400, 'SMTP_NOT_CONFIGURED', 'SMTP sunucusu tanımlı değil');
          throw createError(502, 'SMTP_SEND_FAILED', `Test e-postası gönderilemedi: ${e.message}`);
        }
        res.json({ ok: true, to });
      } catch (e) { next(e); }
    },
  };
}
