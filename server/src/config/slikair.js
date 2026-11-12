import { clientUrlFallback } from '../tenancy/tenantBaseUrl.js';

// Slikair ödeme ağ geçidi ayarları
export const SLIKAIR_SETTINGS = {
  // API kimlik bilgileri
  merchantId:  process.env.SLIKAIR_MERCHANT_ID  || '',
  merchantToken: process.env.SLIKAIR_MERCHANT_TOKEN || '',
  siteId:      process.env.SLIKAIR_SITE_ID      || '',

  // API base URL
  baseUrl: process.env.SLIKAIR_BASE_URL || 'https://sandbox.slikair.online/api/v2',

  // Webhook secret (opsiyonel — Slikair imza doğrulama henüz dokümante edilmemiş)
  webhookSecret: process.env.SLIKAIR_WEBHOOK_SECRET || '',

  // Uygulama URL'leri (kullanıcı yönlendirmeleri için). Single-mode fallback:
  // callers resolve the tenant origin via getTenantBaseUrl() and pass it to
  // getWebhookUrl/getRedirectUrls so multi-tenant callbacks use the tenant's
  // primary Domain instead of the first CLIENT_URL entry.
  appBaseUrl: clientUrlFallback('https://vip90.bet'),

  // Desteklenen ödeme yöntemleri
  paymentMethods: [
    'credit_card', 'credit_card_ftd', 'open_banking', 'crypto',
    'blik', 'googlepay', 'applepay', 'interac', 'mbway',
    'instantbanking', 'revolut', 'skrill', 'ideal', 'trustly',
    'eps', 'neteller', 'rapidtransfer', 'paysafecard', 'mybank',
  ],

  // Minimum yatırma tutarı
  minDeposit: 1,

  // HTTP istek zaman aşımı (ms)
  timeout: 30000,
};

// Slikair API aktif mi?
export function isSlikairEnabled() {
  return !!(SLIKAIR_SETTINGS.merchantId && SLIKAIR_SETTINGS.merchantToken && SLIKAIR_SETTINGS.siteId);
}

// Ödeme yöntemi destekleniyor mu?
export function isPaymentMethodSupported(method) {
  return SLIKAIR_SETTINGS.paymentMethods.includes(method);
}

// Webhook URL'ini oluştur
// Slikair sandbox'tan platforma gelen bildirimlerin hedefi.
// Mimari same-origin: client `/api` base URL'i kullanıyor, ayrı bir "api."
// subdomain'i YOK (DNS'te de kayıtlı değil — 2026-09-17'de gerçek bir
// webhook teslim hatasıyla tespit edildi: "api.vip90.bet" NXDOMAIN
// dönüyordu). `baseUrl` verilmezse single-mode varsayılanı kullanılır;
// çok kiracılı kurulumda çağıran `await getTenantBaseUrl()` sonucunu geçer.
// API_BASE_URL yine de açıkça set edilirse (ör. gerçekten ayrı bir API host'u
// varsa) onu geçersiz kılar.
export function getWebhookUrl(type = 'payin', { baseUrl } = {}) {
  const base = process.env.API_BASE_URL || baseUrl || SLIKAIR_SETTINGS.appBaseUrl;
  return `${base}/api/slikair/webhook/${type}`;
}

// Kullanıcı yönlendirme URL'leri
export function getRedirectUrls({ baseUrl } = {}) {
  const base = baseUrl || SLIKAIR_SETTINGS.appBaseUrl;
  // method=slikair olmadan Profile.jsx sayfası varsayılan 'bank' sekmesiyle
  // açılır — SlikairDeposit.jsx hiç mount olmaz, deposit=success/pending/
  // failed'i işleyen (toast + bakiye/işlem geçmişi yenileme) useEffect'i hiç
  // çalışmaz. 2026-09-22'de canlı testte bulundu: gerçek bir ödeme başarıyla
  // kredilendi ama kullanıcı hiçbir zaman başarı bildirimini görmedi ve
  // sayfayı elle yenilemeden ne bakiyesi ne işlem geçmişi güncellendi.
  return {
    success_url: `${base}/profile?method=slikair&deposit=success`,
    pending_url: `${base}/profile?method=slikair&deposit=pending`,
    fail_url:    `${base}/profile?method=slikair&deposit=failed`,
    back_url:    `${base}/profile?mode=deposit&method=slikair`,
  };
}
