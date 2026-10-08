/**
 * SMS şablon sayfasının saf mantığı — React/ DOM bağımlılığı yok, bu yüzden
 * `node --test` ile doğrudan test edilir (sayfadaki `kpiTone.js` ayrımının aynı
 * gerekçesi: mantığı sayfadan dışarı almadan test edilemez).
 */

/** Tablo tip filtresi değerleri. */
export const TYPE_FILTERS = ['all', 'action', 'scheduled'];

/** Gönderim hedef kitle tipleri (sunucu `SMS_AUDIENCE_TYPES` ile aynı). */
export const AUDIENCE_TYPES = ['users', 'all', 'segment'];

/** Şablon kategorileri (sunucu `SMS_TEMPLATE_CATEGORIES` ile aynı). */
export const CATEGORIES = ['system', 'betting', 'casino', 'wallet', 'promotion'];

/**
 * GSM 03.38 temel karakter kümesi.
 *
 * Türkçe harflerden **ğ Ğ ş Ş ı İ ç** bu kümede YOKTUR (Ç/ü/ö/Ü/Ö/ä/Ä/ñ
 * vardır — Ç'nin küçük harfi tabloda yok, büyük harfi var). Yani bir Türkçe SMS çoğu zaman 160 değil **70** karaktere sığar ve
 * daha çabuk iki parçaya bölünür. Sayacın doğru olması, operatörün "neden iki
 * parçaya bölündü / neden 70 karakterde kesildi" sorusunu cevaplamak içindir.
 */
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡'
    .concat('ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà')
    .split(''),
);

/** Tek mesaj segmenti başına karakter sınırı. */
export const GSM7_LIMIT = 160;
export const UNICODE_LIMIT = 70;

export function isGsm7(content) {
  return [...String(content ?? '')].every(ch => GSM7_BASIC.has(ch));
}

/**
 * Karakter/segment sayacı.
 * @returns {{chars:number, segments:number, encoding:'gsm7'|'unicode', limit:number, overLimit:boolean}}
 */
export function smsCharInfo(content) {
  const chars = [...String(content ?? '')].length;
  const gsm7 = isGsm7(content);
  const limit = gsm7 ? GSM7_LIMIT : UNICODE_LIMIT;
  const segments = chars === 0 ? 0 : Math.ceil(chars / limit);
  return { chars, segments, encoding: gsm7 ? 'gsm7' : 'unicode', limit, overLimit: chars > limit };
}

/** `{{degisken}}` kalıbı — çift süslü parantez (sunucu ile aynı). */
export const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Gövdedeki değişkenleri sıra koruyarak, tekrarsız listeler. */
export function extractPlaceholders(content) {
  const out = [];
  for (const m of String(content ?? '').matchAll(PLACEHOLDER_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Seçili olayın tanımadığı değişkenler — gönderimde boş kalıp mesajın
 * yarım gönderilmesini önlemek için formda uyarı olarak gösterilir.
 * `alwaysAllowed` o an kullanıcı adı gibi her olayda var olanları kapsar.
 */
export function unknownPlaceholders(content, allowed = [], alwaysAllowed = ['username']) {
  const ok = new Set([...allowed, ...alwaysAllowed]);
  return extractPlaceholders(content).filter(v => !ok.has(v));
}

/**
 * Sunucu `SmsError` kodlarını arayüz metnine çevirir. Sunucu Türkçe mesaj da
 * döndürür; İngilizce panellerde o metin görünmesin diye bilinen kodlar için
 * `t('admin.smsGateway.error.<code>')` anahtarı kullanılır (kod camelCase'e
 * çevrilir: `SMS_NOT_CONFIGURED` → `smsNotConfigured`). Bilinmeyen kodlarda
 * sunucu mesajına düşülür.
 */
export function smsGatewayErrorText(t, code, serverMessage = '') {
  if (code) {
    const camel = String(code).toLowerCase().split('_')
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join('');
    const key = `admin.smsGateway.error.${camel}`;
    // Sözlükte olmayan kodlar t() anahtarını ham döndürür — onu sunucu
    // mesajına tercih etme; yalnız çevrilmiş metin varsa kullan.
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return serverMessage || t('admin.smsGateway.testFailed');
}

/**
 * Axios hatası → okunabilir arayüz metni (SmsTemplates'in beş catch'i).
 *
 * Sunucu `{error:{message}}` gövdesi döndürdüyse o metin eski davranışla
 * aynıdır. Gövde YOKSA (ağ kopması, deploy/restart penceresi, nginx'in boş
 * döndüğü 502/504, HTML hata sayfası) eski kod `e.response.data.error.message`
 * undefined olduğu için genel "kaydedilemedi/yüklenemedi" çevirisine
 * düşüyordu — operatör hatanın kaynağını göremiyordu. Burada sırayla:
 * string hata gövdesi → `{message}` → HTTP durumu → bağlantı hatası.
 */
export function apiErrorMessage(t, e) {
  const err = e?.response?.data?.error;
  if (typeof err === 'string' && err.trim()) return err;
  if (typeof err?.message === 'string' && err.message) return err.message;
  if (e?.response) return t('admin.smsTemplates.serverError', { status: e.response.status });
  return t('admin.smsTemplates.networkError');
}

/**
 * Eksik yapılandırma parçaları → arayüz etiketleri.
 * Sunucu `status.missing` alanını döndürür (`accountSid|authToken|sender`);
 * daha eski bir sunucuya karşı istemci türetmesi de vardır.
 */
export function deriveSmsMissing(status) {
  if (Array.isArray(status?.missing) && status.missing.length) return status.missing;
  return [
    ...(status?.accountSid ? [] : ['accountSid']),
    ...(status?.authTokenConfigured ? [] : ['authToken']),
    ...((status?.fromNumber || status?.messagingServiceSid) ? [] : ['sender']),
  ];
}