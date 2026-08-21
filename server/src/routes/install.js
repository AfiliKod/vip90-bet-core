/**
 * K2 — Kurulum sihirbazı HTTP yüzeyi.
 *
 * /install            → tek sayfalık kurulum formu (build gerektirmez)
 * /install/api/status → DB bağlantısı + kurulum durumu
 * /install/api/run    → ilk yönetici + site ayarları + .env çıktısı
 *
 * Handler'lar DI'lı fabrikadan gelir (testler sahte modellerle çalışır);
 * varsayılan router gerçek User/Setting modellerini bağlar.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Setting from '../models/Setting.js';
import { createInstaller } from '../../../installer/core.js';
import { INSTALL_PAGE_HTML } from '../../../installer/page.js';

export function createInstallHandlers({ userModel, settingModel, dbState }) {
  const installer = createInstaller({ userModel, settingModel, dbState });

  async function pageHandler(req, res) {
    res.set('Cache-Control', 'no-store');
    res.send(INSTALL_PAGE_HTML);
  }

  async function statusHandler(req, res) {
    res.json(await installer.status());
  }

  async function runHandler(req, res) {
    try {
      const result = await installer.run(req.body || {});
      // .env üretimi: JWT anahtarları kurulumda bir kez üretilir; operatör
      // içeriği kopyalayıp host'taki .env'e yapıştırır (Docker'da compose
      // MONGODB_URI'yi kendi mongo'suna ezdiği için içerik güvenlidir).
      const secrets = installer.generateSecrets();
      const clientUrl = String(req.body?.clientUrl || '').trim() ||
        `${req.protocol}://${req.get('host')}`;
      const envContent = installer.buildEnvContent({ ...secrets, clientUrl });
      res.json({ ...result, envContent });
    } catch (e) {
      if (e.code === 'ALREADY_INSTALLED') return res.status(409).json({ error: e.message });
      if (e.code === 'VALIDATION') return res.status(400).json({ error: e.message, fields: e.fields });
      throw e;
    }
  }

  return { pageHandler, statusHandler, runHandler };
}

export default function createInstallRouter() {
  const r = Router();
  const handlers = createInstallHandlers({
    userModel: User,
    settingModel: Setting,
    dbState: () => mongoose.connection.readyState,
  });
  r.get('/', handlers.pageHandler);
  r.get('/api/status', handlers.statusHandler);
  r.post('/api/run', handlers.runHandler);
  return r;
}
