// client/src/components/admin/emailProviderLogic.js
//
// E-posta sağlayıcı ön ayarları — saf (DOM bağımsız) mantık, `EmailProviderPanel`
// kullanır, testi ayrıca (`emailProviderLogic.test.js`).
//
// Neden ayrı: panel iki yerde görünür (Modules → Communication Providers
// kartı, İletişim → E-posta → Provider sekmesi) ve preset eşlemesinin
// doğruluğu kaydırma riski olmadan test edilmek istendi.
//
// Sağlayıcı iki şeyi belirler: (1) panel ön ayarı — host/port/secure forma
// doldurulur (kaydetmeden önce düzenlenebilir); (2) 2026-10-30'dan itibaren
// MEKANİZMA — `mailtrap` seçiliyken ve token giriliyken sunucu genel SMTP
// yerine Mailtrap Email API'sini kullanır (`emailConfig.resolveEmailMode`).
// Diğer sağlayıcılar her koşulda SMTP transport'unu kullanmaya devam eder.

export const EMAIL_PROVIDERS = ['mailtrap', 'mailgun', 'ses', 'postmark', 'custom'];

export const EMAIL_PROVIDER_PRESETS = {
  // Mailtrap API ile gönderir: bağlantı alanı gerekmez (preset boş).
  mailtrap: {},
  mailgun: { host: 'smtp.mailgun.org', port: '587', secure: false },
  ses: { host: 'email-smtp.us-east-1.amazonaws.com', port: '587', secure: false },
  postmark: { host: 'smtp.postmarkapp.com', port: '587', secure: false },
  custom: {},
};

/**
 * Panelde hangi sağlayıcı seçili görünmeli?
 *  - Kayıtlı `provider` varsa o (sunucu alanı).
 *  - Yoksa host'tan çıkarılır — üretimde `smtp.mailgun.org` oturur,
 *    panel ilk açılışta doğru sağlığı gösterir.
 *  - Host da yoksa ve Mailtrap token'ı tanımlıysa `mailtrap` (API kurulumunda
 *    host alanı boş kalır, aksi halde panel 'custom' sanıp SMTP ister).
 * @param {{tokenConfigured?: boolean}} [hints]
 */
export function inferEmailProvider(host, provider, hints = {}) {
  if (provider && EMAIL_PROVIDERS.includes(provider)) return provider;
  const h = String(host || '').trim().toLowerCase();
  if (h) {
    if (h === 'smtp.mailgun.org' || h.endsWith('.mailgun.org')) return 'mailgun';
    if (h.includes('amazonaws.com')) return 'ses';
    if (h.includes('postmark')) return 'postmark';
    if (h.includes('mailtrap')) return 'mailtrap';
    return 'custom';
  }
  return hints.tokenConfigured ? 'mailtrap' : 'custom';
}

/**
 * Sağlayıcı → forma doldurulan alanlar.
 *  - `provider` her zaman forma yazılır (sunucu DB'ye açık seçim olarak alır).
 *  - Hazırlı SAĞLAYICILAR host/port/secure'u doldurur (kaydetmeden önce
 *    düzenlenebilir); `custom` mevcut bağlantı alanlarına dokunmaz.
 */
export function applyProviderPreset(provider, form = {}) {
  if (!EMAIL_PROVIDERS.includes(provider)) return { ...form };
  const next = { ...form, provider };
  const preset = EMAIL_PROVIDER_PRESETS[provider];
  if (preset?.host) {
    next.host = preset.host;
    next.port = preset.port;
    next.secure = preset.secure;
  }
  return next;
}
