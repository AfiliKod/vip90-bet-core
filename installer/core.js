import { randomBytes } from 'node:crypto';

/**
 * K2 — Kurulum sihirbazı çekirdeği.
 *
 * Framework'süz, saf, DI'lı (desen: server/src/theme/registry.js). Sunucu
 * tarafındaki route bu modülü kendi modelleriyle çağırır; testler sahte
 * modellerle MongoDB'siz çalışır.
 *
 * Kurulum akışı (terminal açmadan):
 *   1. Operatör `docker compose up -d` der (K1).
 *   2. Tarayıcıdan /install açar — sunucu DB erişilebilirken ayaktadır.
 *   3. Form: site adı, para birimi, ilk yönetici hesabı.
 *   4. run() admin'i oluşturur, site ayarlarını Setting'e yazar,
 *      .env içeriği üretip ekranda gösterir (kopyala/yapıştır).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[A-Za-z]{3,8}$/;

function validate(input) {
  const errors = [];
  const siteName = String(input.siteName ?? '').trim();
  if (!siteName || siteName.length > 60) errors.push('siteName');
  if (!CURRENCY_RE.test(String(input.currency ?? ''))) errors.push('currency');
  const username = String(input.adminUsername ?? '').trim();
  if (username.length < 3 || username.length > 30) errors.push('adminUsername');
  if (!EMAIL_RE.test(String(input.adminEmail ?? ''))) errors.push('adminEmail');
  if (String(input.adminPassword ?? '').length < 8) errors.push('adminPassword');
  return { errors, siteName, currency: String(input.currency).toUpperCase(), username };
}

export function createInstaller({ userModel, settingModel, dbState }) {
  async function status() {
    const dbConnected = dbState() === 1;
    let adminExists = false;
    if (dbConnected) {
      adminExists = Boolean(await userModel.findOne({ role: 'admin' }));
    }
    return { dbConnected, adminExists, needsInstall: !adminExists };
  }

  async function run(input) {
    const existing = await userModel.findOne({ role: 'admin' });
    if (existing) {
      const err = new Error('[ALREADY_INSTALLED] Kurulum zaten tamamlanmış');
      err.code = 'ALREADY_INSTALLED';
      throw err;
    }

    const { errors, siteName, currency, username } = validate(input);
    if (errors.length) {
      const err = new Error(`[VALIDATION] Geçersiz alanlar: ${errors.join(', ')}`);
      err.code = 'VALIDATION';
      err.fields = errors;
      throw err;
    }

    // Gerçek User modelinde pre-save hook parolayı bcrypt ile hash'ler.
    await userModel.create({
      username,
      email: String(input.adminEmail).trim().toLowerCase(),
      password: input.adminPassword,
      role: 'admin',
      isActive: true,
    });

    for (const [key, value] of [
      ['site.name', siteName],
      ['site.currency', currency],
      ['setup.completed', 'true'],
    ]) {
      await settingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
    }

    return { ok: true, siteName, currency, adminUsername: username };
  }

  function generateSecrets() {
    return {
      jwtSecret: randomBytes(48).toString('base64'),
      jwtRefreshSecret: randomBytes(48).toString('base64'),
    };
  }

  function buildEnvContent({ jwtSecret, jwtRefreshSecret, clientUrl }) {
    return [
      '# VIP90.bet kurulum sihirbazı çıktısı — server/.env olarak kaydedin',
      '# (Docker compose kullanıyorsanız MONGODB_URI\'yi .env\'e YAZMAYIN:',
      '#  docker-compose.yml onu compose içi mongo servisine yönlendirir.)',
      '',
      'MONGODB_URI=mongodb://mongo:27017/betzone',
      `JWT_SECRET=${jwtSecret}`,
      `JWT_REFRESH_SECRET=${jwtRefreshSecret}`,
      `CLIENT_URL=${clientUrl}`,
      'NODE_ENV=production',
      'PORT=3001',
      '',
    ].join('\n');
  }

  return { status, run, generateSecrets, buildEnvContent };
}
