/**
 * Alıcı baskılama: belirli domainlere HİÇ mail gönderilmez.
 *
 * Neden: demo/seed hesapları (`@seed.local`, e2e smoke `@test.local`) gerçek
 * olaylara da konu oluyor — kayıt, yatırım/çekim bildirimi, destek bileti — ve
 * her olay sağlayıcıya gerçek bir gönderim emisyonu üretir (Mailtrap loglarında
 * `enqueued` satırları). `.local` ayrılmış bir TLD'dir, public DNS'te çözülmez;
 * bu adresler teslim edilemez, sadece kotarya/hacim yakar ve bir sprintte
 * sağlayıcı itibarını zedeler.
 *
 * Kural tek yerde; iki yerde uygulanır:
 *  - `services/email.js` — transport sınırında (systemMail, ticket, alert ve
 *    ileride eklenecek her çağıran için emniyet sübabı),
 *  - `services/systemMail.js` — kitle seçim sorgusunda (gereksiz log/iterasyon yok).
 *
 * `MAIL_SUPPRESS_EMAIL_DOMAINS`: virgülle ayrılmış domain/TLD listesi. Listedeki
 * bir giriş hem kendisini hem alt domainlerini kapsar (`seed.local` →
 * `a.seed.local` de baskılanır). Listeyi daraltmak/genişletmek operatör kararı:
 * `MAIL_SUPPRESS_EMAIL_DOMAINS=` boş bırakılırsa baskılama kapalıdır (gerçek
 * alıcıya göndermek isteyen kurulum için).
 */

/**
 * Varsayılanlar:
 *  - `seed.local`  → `demoData/userSeed.js` SEED_DOMAIN
 *  - `test.local`  → `scripts/e2e-smoke-test.mjs` kayıt adresleri
 *  - `local`       → ayrılmış TLD; her `.local` adresini de kapsar
 */
export const DEFAULT_SUPPRESSED_EMAIL_DOMAINS = ['seed.local', 'test.local', 'local'];

const ENV_KEY = 'MAIL_SUPPRESS_EMAIL_DOMAINS';

/** normalize: küçük harf, boşluksuz, baştaki nokta toleranslı, tekil. */
export function normalizeDomains(list) {
  return [...new Set(
    (Array.isArray(list) ? list : String(list || '').split(','))
      .map(d => String(d).trim().toLowerCase().replace(/^\.+/, ''))
      .filter(Boolean),
  )];
}

/**
 * Etkin liste. `env` anahtarı TANIMLIYSA (boş dahil) o kazanır: tanımlı ve boş
 * = baskılama yok. Anahtar yoksa varsayılanlar.
 */
export function suppressedEmailDomains(env = process.env) {
  const raw = env[ENV_KEY];
  if (raw === undefined) return [...DEFAULT_SUPPRESSED_EMAIL_DOMAINS];
  return normalizeDomains(raw);
}

/**
 * Sorguya çevrilecek regex deseni: `@`- sonrası domain veya alt domaini.
 * Noktalar kaçırılır; `seedXlocal` gibi eşleşme olmaz.
 */
export function suppressedDomainPattern(domains = suppressedEmailDomains()) {
  const escaped = normalizeDomains(domains)
    .map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return null;
  return `@(?:[a-z0-9._-]+\\.)?(?:${escaped.join('|')})$`;
}

/** Bu adrese mail gönderilir mi? (domain listesi boşsa her zaman false) */
export function isSuppressedRecipient(email, domains = suppressedEmailDomains()) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return false; // adresi olmayan kayda zaten gönderilmez
  const pattern = suppressedDomainPattern(domains);
  if (!pattern) return false;
  return new RegExp(pattern, 'i').test(value);
}
