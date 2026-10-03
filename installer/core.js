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
 *   3. Form: site adı, para birimi, ilk yönetici hesabı, (opsiyonel) modüller.
 *   4. run() admin'i oluşturur, ayarları uygulamanın GERÇEKTEN okuduğu
 *      anahtarlara yazar (`branding.siteName` → getSiteName, `currency.code` →
 *      getActiveCurrency, `module.<id>.enabled` → modül kapıları), .env içeriği
 *      üretip ekranda gösterir (kopyala/yapıştır).
 *
 * `site.name` / `site.currency` anahtarları hiçbir iş mantığı tarafından
 * okunmuyor; yalnız sağlık denetiminin "tohumlandı" işareti (health/checks.js)
 * olarak yazılmaya devam ediyor.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONGO_URI_RE = /^mongodb(\+srv)?:\/\/\S+$/;
const HTTP_URL_RE = /^https?:\/\/\S+$/;

/** Docker compose'un app servisine verdiği bağlantı (replica set transaction için zorunlu). */
export const DOCKER_MONGODB_URI = 'mongodb://mongo:27017/betzone?replicaSet=rs0';

/** Desteklenen para birimleri: server/src/currency/registry.js CURRENCY_DEFINITIONS ile aynı olmalı (testle doğrulanır). */
export const DEFAULT_CURRENCY_CODES = ['TRY', 'USD', 'EUR'];

/** Kurulumda "başlangıçta açık olsun" seçilebilen modüller (input alanı → modül kimliği). */
export const OPTIONAL_MODULES = [
  { field: 'enableCrypto', moduleId: 'crypto-payment' },
  { field: 'enableKyc', moduleId: 'kyc-verification' },
];

const truthy = v => v === true || v === 'true' || v === 'on' || v === '1' || v === 1;

function validate(input, currencyCodes) {
  const errors = [];
  const siteName = String(input.siteName ?? '').trim();
  if (!siteName || siteName.length > 60) errors.push('siteName');
  if (!currencyCodes.includes(String(input.currency ?? '').toUpperCase())) errors.push('currency');
  const username = String(input.adminUsername ?? '').trim();
  if (username.length < 3 || username.length > 30) errors.push('adminUsername');
  if (!EMAIL_RE.test(String(input.adminEmail ?? ''))) errors.push('adminEmail');
  if (String(input.adminPassword ?? '').length < 8) errors.push('adminPassword');
  if (String(input.deployMode ?? 'docker') === 'manual' && !MONGO_URI_RE.test(String(input.mongoUri ?? '').trim())) errors.push('mongoUri');
  return { errors, siteName, currency: String(input.currency).toUpperCase(), username };
}

export function createInstaller({
  userModel, settingModel, dbState,
  currencyCodes = DEFAULT_CURRENCY_CODES,
  // Ayarlar yazıldıktan sonra süreç içi önbellekleri (branding/currency/modules,
  // 30 sn TTL) hemen geçersiz kılmak için; testlerde gerekmez.
  afterSettingsWritten = () => {},
}) {
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

    const { errors, siteName, currency, username } = validate(input, currencyCodes);
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

    const enabledModules = OPTIONAL_MODULES
      .filter(m => truthy(input[m.field]))
      .map(m => m.moduleId);

    const writes = [
      ['branding.siteName', siteName],
      ['currency.code', currency],
      // Sağlık denetimi (health/checks.js) "tohumlandı" işareti olarak okuyor.
      ['site.name', siteName],
      ['site.currency', currency],
      ['setup.completed', 'true'],
      // Seçilmeyen modüle kayıt YAZILMAZ: kayıt yok = kapalı (varsayılan).
      ...enabledModules.map(id => [`module.${id}.enabled`, 'true']),
    ];
    for (const [key, value] of writes) {
      await settingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
    }
    await afterSettingsWritten();

    return { ok: true, siteName, currency, adminUsername: username, enabledModules };
  }

  function generateSecrets() {
    return {
      jwtSecret: randomBytes(48).toString('base64'),
      jwtRefreshSecret: randomBytes(48).toString('base64'),
    };
  }

  /**
   * mongoUri verilirse (Docker dışı kurulum) o yazılır; verilmezse Docker
   * compose varsayılanı (replica set'li compose içi mongo) kullanılır.
   */
  function buildEnvContent({ jwtSecret, jwtRefreshSecret, clientUrl, mongoUri }) {
    const manual = Boolean(mongoUri);
    return [
      '# VIP90.bet kurulum sihirbazı çıktısı — server/.env olarak kaydedin',
      ...(manual
        ? ['# MongoDB replica set olmalı (bahis sonuçlandırma/transaction standalone\'da çalışmaz).']
        : [
          '# (Docker compose kullanıyorsanız MONGODB_URI\'yi .env\'e YAZMAYIN:',
          '#  docker-compose.yml onu compose içi mongo servisine yönlendirir.)',
        ]),
      '',
      `MONGODB_URI=${manual ? mongoUri : DOCKER_MONGODB_URI}`,
      `JWT_SECRET=${jwtSecret}`,
      `JWT_REFRESH_SECRET=${jwtRefreshSecret}`,
      `CLIENT_URL=${clientUrl}`,
      'NODE_ENV=production',
      'PORT=3001',
      '',
    ].join('\n');
  }

  /** Form girdisinden .env için güvenli MONGODB_URI seçer; geçersizse null. */
  function resolveMongoUri(input) {
    if (String(input.deployMode ?? 'docker') !== 'manual') return { mongoUri: undefined, ok: true };
    const uri = String(input.mongoUri ?? '').trim();
    return MONGO_URI_RE.test(uri) ? { mongoUri: uri, ok: true } : { mongoUri: undefined, ok: false };
  }

  /** .env'e yazılacak CLIENT_URL'yi satır enjeksiyonuna karşı doğrular. */
  function safeClientUrl(candidate, fallback) {
    const c = String(candidate ?? '').trim();
    return HTTP_URL_RE.test(c) ? c : fallback;
  }

  return { status, run, generateSecrets, buildEnvContent, resolveMongoUri, safeClientUrl };
}
