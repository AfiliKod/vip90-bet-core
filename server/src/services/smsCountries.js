/**
 * E.164 telefon numarasından ülke (ISO-3166 alpha-2) tahmini.
 *
 * Neden var: `User` şemasında `country` alanı YOK (segment kriterleri
 * `query.country` kullanıyor ama mongoose strict mode'da alanı düşürüyor),
 * yani gönderim anında alıcının ülkesini güvenilir biçimde bilmiyoruz.
 * Numaranın ülke kodundan türetilebilir.
 *
 * Neden kısa liste: Node'da güvenilir bir telefon→ülke veri tabanı yok.
 * Ürünün fiilen hedeflediği ülkeler için küratörlü bir liste, devasa ve
 * yanlış-aşımlı bir tabloya göre daha dürüst. Listede OLMAYAN ülke kodu için
 * `null` döner; o durumda ülke kısıtı UYGULANMAZ ve karar Twilio'nun kendi
 * hata kodlarına (30041 / 30040 — "sender kayıtsız / ön kayıt gerekli")
 * bırakılır.
 *
 * `+1` NANP bölgesidir (ABD/Kanada + Karayip); tek ülkeye indirgemez —
 * panelde yalnız gönderici kaydı değil, operatör beyanı esas olduğu için
 * `US` döndürüp dokümanda bu sadeleşmeyi açıkça belirtiyoruz.
 */
const PREFIX_TO_ISO = {
  '1': 'US',   // NANP: ABD/Kanada/Karayip — bkz. yukarıdaki not
  '7': 'RU',   // eski bölge kodu; KZ +77, RU +79 (basitleştirilmiş)
  '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR',
  '34': 'ES', '36': 'HU', '38': 'HR', '39': 'IT', '40': 'RO', '41': 'CH',
  '43': 'AT', '44': 'GB', '45': 'DK', '46': 'SE', '47': 'NO', '48': 'PL',
  '49': 'DE', '52': 'MX', '54': 'AR', '55': 'BR', '56': 'CL', '57': 'CO',
  '60': 'MY', '61': 'AU', '62': 'ID', '63': 'PH', '64': 'NZ', '65': 'SG',
  '66': 'TH', '81': 'JP', '82': 'KR', '84': 'VN', '86': 'CN', '88': 'BD',
  '90': 'TR', '91': 'IN', '92': 'PK', '351': 'PT', '353': 'IE', '355': 'AL',
  '358': 'FI', '359': 'BG', '380': 'UA', '381': 'RS', '385': 'HR', '386': 'SI',
  '420': 'CZ', '421': 'SK', '886': 'TW', '971': 'AE', '972': 'IL',
  '966': 'SA', '234': 'NG', '254': 'KE', '905': 'TR',
};

/**
 * @param {string} e164  `+90...` biçiminde normalize edilmiş numara
 * @returns {string|null} ISO-3166 alpha-2 ya da bilinmiyorsa `null`
 */
export function countryFromE164(e164) {
  if (!e164) return null;
  const digits = String(e164).replace(/^\+/, '');
  if (!digits) return null;

  // Uzunluk tanıyıcısı olmayan ülkelerde 3 haneli önek, kalanında 2, son
  // çare 1 haneli. Uzun önek önce denenir (+90 5xx → TR, +905 → TR).
  for (const len of [3, 2, 1]) {
    if (digits.length <= len) continue;
    const iso = PREFIX_TO_ISO[digits.slice(0, len)];
    if (iso) return iso;
  }
  return null;
}

/** Kısa listede tanıdığımız ülke kodları (panelde seçilebilir liste için). */
export const KNOWN_COUNTRIES = [...new Set(Object.values(PREFIX_TO_ISO))].sort();