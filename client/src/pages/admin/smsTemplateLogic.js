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