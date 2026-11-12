/**
 * K3 — Sağlık kontrolü çekirdeği.
 *
 * Kurulum sonrası sistemin kendi durumunu raporlaması: DB bağlantısı,
 * zorunlu env değişkenleri, temel servis yapılandırması, bekleyen
 * migration ve tohumlama durumu. Saf ve DI'lı — CLI (scripts/healthcheck.js)
 * gerçek bağımlılıkları bağlar, testler sahtelerle koşar.
 *
 * Durum seviyeleri: ok < warn < fail. `ok` alanı yalnızca fail varsa false —
 * warn'lar kurulumu bloke etmez, operatörü bilgilendirir.
 */
import { getTenancyMode } from '../config/tenancy.js';

const REQUIRED_ENV = [
  { key: 'MONGODB_URI', minLen: 1 },
  { key: 'JWT_SECRET', minLen: 32 },
  { key: 'JWT_REFRESH_SECRET', minLen: 32 },
  // Site links come from each tenant's primary Domain in multi mode.
  { key: 'CLIENT_URL', minLen: 1, singleModeOnly: true },
];

const OPTIONAL_SERVICES = [
  { name: 'service:igames', label: 'Igames Casino', envKey: 'PALACE_API_TOKEN' },
  // Ad `service:smtp` kalır (panel/health sözleşmesi); kapsam artık her iki
  // mekanizmayı da kapsar: Mailtrap API token'ı veya SMTP host'u.
  { name: 'service:smtp', label: 'E-posta gönderimi', envKey: 'SMTP_HOST' },
];

// Panelden (DB) kaydedilen değerler env'e göre önceliklidir. Varsayılan çözücüler
// yalnızca DB bağlıyken devreye girer; eklenti (igames) yoksa sessizce env'e düşülür.
// Her çözücü "yapılandırılmış mı" (boolean) döner; testte `resolvers` ile enjekte edilir.
const DEFAULT_RESOLVERS = {
  'service:smtp': async () => {
    const { emailConfig, emailEnvView, resolveEmailMode } = await import('../config/emailConfig.js');
    const all = await emailConfig.getAll();
    // Gateway kapalıyken panel DB değerleri yok sayılır → env tek kaynaktır ve
    // SMTP host'u env'deyse yukarıdaki hızlı yol zaten 'ok' der.
    if (all.gatewayEnabled !== 'false') return resolveEmailMode(all) !== 'none';
    return resolveEmailMode(emailEnvView()) !== 'none';
  },
  'service:igames': async () => {
    const { refreshIgamesCredentialsNow } = await import('../premium/igames/igamesCredentials.js');
    return !!(await refreshIgamesCredentialsNow()).apiToken;
  },
};

function isPlaceholder(v) {
  return !v || /CHANGE_ME|BURAYA_/i.test(v);
}

export async function runHealthChecks({ dbState, env = {}, pendingMigrations, settingModel, resolvers = DEFAULT_RESOLVERS }) {
  const checks = [];

  // 1. Veritabanı
  const connected = dbState() === 1;
  checks.push({
    name: 'database',
    status: connected ? 'ok' : 'fail',
    detail: connected ? 'MongoDB bağlantısı kuruldu' : 'MongoDB bağlantısı YOK',
  });

  // 2. Zorunlu env değişkenleri (CLIENT_URL yalnız single modda zorunlu)
  const mode = getTenancyMode(env);
  for (const { key, minLen, singleModeOnly } of REQUIRED_ENV) {
    if (singleModeOnly && mode !== 'single') continue;
    const v = String(env[key] ?? '');
    const bad = v.length < minLen;
    checks.push({
      name: `env:${key}`,
      status: bad ? 'fail' : 'ok',
      detail: bad ? `eksik veya çok kısa (min ${minLen} karakter)` : 'tanımlı',
    });
  }

  // 3. Opsiyonel servisler — eksikleri uyarıdır
  for (const s of OPTIONAL_SERVICES) {
    let configured = !isPlaceholder(env[s.envKey]);
    if (!configured && connected && resolvers[s.name]) {
      try { configured = !!(await resolvers[s.name]()); } catch { /* env sonucu geçerli */ }
    }
    checks.push({
      name: s.name,
      status: configured ? 'ok' : 'warn',
      detail: configured ? `${s.label} yapılandırılmış` : `${s.label} yapılandırılmamış (${s.envKey} veya panel ayarı)`,
    });
  }

  // 4. Migration durumu
  try {
    const pending = await pendingMigrations();
    checks.push({
      name: 'migrations',
      status: pending.length ? 'warn' : 'ok',
      detail: pending.length
        ? `${pending.length} bekleyen migration: node scripts/migrate.js`
        : 'tüm migration\'lar uygulanmış',
    });
  } catch (e) {
    checks.push({ name: 'migrations', status: 'warn', detail: `durum okunamadı: ${e.message}` });
  }

  // 5. Tohumlama durumu
  try {
    const siteName = await settingModel.findOne({ key: 'site.name' });
    checks.push({
      name: 'seed',
      status: siteName ? 'ok' : 'warn',
      detail: siteName ? `site adı: ${siteName.value}` : 'site ayarları tohumlanmamış: node scripts/seed.js',
    });
  } catch (e) {
    checks.push({ name: 'seed', status: 'warn', detail: `okunamadı: ${e.message}` });
  }

  return {
    ok: !checks.some(c => c.status === 'fail'),
    checks,
  };
}
