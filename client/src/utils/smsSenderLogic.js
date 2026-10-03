/**
 * Gönderici ekranının saf mantığı.
 *
 * `toKeySegment` neden var: i18n anahtar kuralı (`i18n/core.js` `KEY_RE`)
 * her segmentte alt çizgiyi YASAKLAR, ama sunucu tarafındaki enum değerleri
 * (`long_code`, `a2p_10dlc`, `SMS_SENDER_NOT_REGISTERED`, `a2p_unregistered_number`)
 * repo'nun DB konvansiyonu gereği alt çizli büyük harfli. Aynı tuzak
 * `ActivityFeed.jsx` içinde de not düşülmüş: sunucu değeri doğrudan anahtara
 * çevrilirse `t()` çalışma zamanında hata verir.
 *
 * Burada tek bir yönlendirme var: `değer → anahtar segmenti`. Sunucunun
 * değerleri değişirse ESKİ anahtar segmentleriyle eşleşmeye devam ederiz
 * (dizeler değişmez), böylece çeviriler bozulmaz.
 */
export const toKeySegment = value => {
  // Sunucu değerleri iki biçimde geliyor: enum'lar küçük (`long_code`),
  // hata/engel kodları SCREAMING_SNAKE (`SMS_SENDER_NOT_REGISTERED`).
  // Önce TAMAMEN küçültüp sonra camelCase'e çeviriyoruz; `KEY_RE` her
  // segmentin küçük harfle başlamasını şart koşuyor.
  const camel = String(value ?? '')
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return camel.charAt(0).toLowerCase() + camel.slice(1);
};/** Sunucunun `SMS_BLOCK_REASONS` değerleri (log/send özetinde döner). */
export const SENDER_BLOCK_REASONS = [
  'SMS_SENDER_NOT_REGISTERED',
  'SMS_SENDER_MISMATCH',
  'SMS_SENDER_COUNTRY_DENIED',
  'SMS_TRIAL_NUMBER_NOT_VERIFIED',
  'SMS_TRIAL_COUNTRY_DENIED',
  'SMS_INVALID_PHONE',
];

/**
 * `smsGateway.js` → `TWILIO_ERROR_MEANINGS` değerleri. Panel log'da bunları
 * `admin.smsSenders.twilioError.<segment>` ile çevirir; sunucuda karşılığı
 * gelmeyen kodlar için çeviri anahtarı üretilse de değer boş kalır ve `t()`
 * anahtarın kendisini döndürür (çökmez).
 */
export const TWILIO_ERROR_MEANINGS = [
  'trial_feature_unsupported',
  'rate_limit_exceeded',
  'from_not_sms_capable',
  'invalid_to_trial_mode',
  'invalid_to_number',
  'recipient_unsubscribed',
  'to_from_combination',
  'to_not_mobile',
  'body_too_long',
  'alpha_sender_not_authorized',
  'sender_not_in_messaging_service',
  'destination_unreachable',
  'landline_or_unreachable',
  'message_filtered',
  'a2p_campaign_suspended',
  'a2p_unregistered_number',
  'a2p_number_configuring',
  'sender_id_pre_registration',
  'sender_restricted_in_country',
  'alpha_sender_generic',
  'a2p_number_registration_failed',
  'a2p_number_failed_registration',
  'toll_free_gambling_disallowed',
  'toll_free_opt_in_missing',
];