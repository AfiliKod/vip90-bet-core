// client/src/components/admin/emailProviderLogic.js
//
// E-posta sağlayıcı ön ayarları — saf (DOM bağımsız) mantık, `EmailProviderPanel`
// kullanır, testi ayrıca (`emailProviderLogic.test.js`).
//
// Neden ayrı: panel iki yerde görünür (Modules → Communication Providers
// kartı, İletişim → E-posta → Provider sekmesi) ve preset eşlemesinin
// doğruluğu kaydırma riski olmadan test edilmek istendi.
//
// Sağlayıcı yalnızca PANEL HAZIRLIĞI içindir; transport her koşulda genel
// SMTP'dir (`services/email.js`). Host env'den geliyorsa panel doğru değeri
// görür, operator yeni sağlayıcı seçerse host/port/secure forma doldurulur
// (kaydetmeden önce düzenlenebilir).

export const EMAIL_PROVIDERS = ['mailgun', 'ses', 'postmark', 'custom'];

export const EMAIL_PROVIDER_PRESETS = {
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
 */
export function inferEmailProvider(host, provider) {
  if (provider && EMAIL_PROVIDERS.includes(provider)) return provider;
  const h = String(host || '').trim().toLowerCase();
  if (!h) return 'custom';
  if (h === 'smtp.mailgun.org' || h.endsWith('.mailgun.org')) return 'mailgun';
  if (h.includes('amazonaws.com')) return 'ses';
  if (h.includes('postmark')) return 'postmark';
  return 'custom';
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
