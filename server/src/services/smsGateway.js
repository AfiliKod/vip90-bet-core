/**
 * SMS Gateway — sağlayıcı gönderim adaptörleri.
 *
 * Twilio SDK'si yerine native `fetch`: tek bir REST çağrısı (Basic auth +
 * form-encoded gövde) ve bağımlılık eklememesi için. `fetchImpl` enjekte
 * edilebildiği için bu dosya DB'siz ve ağsız test edilir.
 *
 * Adaptör sözleşmesi: `send()` asla throw etmez, her zaman
 * `{ ok, sid, status, code, error }` döner. Çağıran (servis) sonucu log'a
 * yazar; gönderim hatası domain akışını (bahis sonucu, çekim onayı…) BOZMAMALIDIR.
 */

const DEFAULT_BASE_URL = 'https://api.twilio.com';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * İlgili Twilio hata kodlarının anlamı.
 *
 * Kaynak: Twilio "Error and Warning Dictionary" (twilio.com/docs/api/errors).
 * Log'da ham mesajın yanında BU kod da saklanır; panel bunu i18n'li bir
 * açıklamaya çevirir. Operatörün en çok "neden gitmedi?" sorusunu yanıtlayan
 * grup: trial (10002/14111), gönderici kaydı (30034/30041/30040/30126),
 * alıcı erişilebilirliği (30003/30006) ve içerik (21617).
 */
export const TWILIO_ERROR_MEANINGS = {
  10002: 'trial_feature_unsupported',   // Trial hesaplar bu özelliği desteklemez
  14107: 'rate_limit_exceeded',         // SMS gönderim hız limiti aşıldı
  14108: 'from_not_sms_capable',        // From numarası SMS yetkili değil
  14111: 'invalid_to_trial_mode',       // Trial modunda To numarası geçersiz (doğrulanmamış)
  21211: 'invalid_to_number',           // To numarası geçersiz
  21610: 'recipient_unsubscribed',      // Alıcı abonelikten çıkmış (opt-out)
  21612: 'to_from_combination',         // To/From ikilisi bu mesajı gönderemiyor
  21614: 'to_not_mobile',               // To numarası mobil değil
  21617: 'body_too_long',               // Gövde 1600 karakter sınırını aşıyor
  21709: 'alpha_sender_not_authorized', // Alphanumeric Sender ID bu servis için yetkili değil
  21711: 'sender_not_in_messaging_service', // Gönderici bu Messaging Service'e bağlı değil
  30003: 'destination_unreachable',     // Alıcı cihaz erişilemez
  30006: 'landline_or_unreachable',     // Sabit hat ya da erişilemeyen operatör
  30007: 'message_filtered',            // Mesaj operatör tarafından filtrelendi
  30033: 'a2p_campaign_suspended',      // A2P 10DLC kampanyası askıya alındı
  30034: 'a2p_unregistered_number',     // ABD A2P 10DLC — numara kayıtsız
  30035: 'a2p_number_configuring',      // A2P 10DLC — numara hâlâ yapılandırılıyor
  30040: 'sender_id_pre_registration',  // Hedef operatör Sender ID ön kaydı istiyor
  30041: 'sender_restricted_in_country',// Gönderici bu ülkede kayıtlı değil/kısıtlı
  30042: 'alpha_sender_generic',        // Alphanumeric Sender ID generic veya yetkisiz
  30125: 'a2p_number_registration_failed', // Numara A2P 10DLC'ye kaydedilemedi
  30126: 'a2p_number_failed_registration', // 10DLC numarası kayıt başarısız
  30461: 'toll_free_gambling_disallowed', // Toll-free doğrulaması: kumar içeriği kabul edilmiyor
  30476: 'toll_free_opt_in_missing',    // Toll-free doğrulaması: opt-in kanıtı yok
};

/**
 * E.164 normalize etme — Twilio uluslararası numara ister.
 *
 *   "+90 532 111 22 33"  → +905321112233   (doğrudan E.164)
 *   "00905321112233"     → +905321112233   (00 uluslararası öneki)
 *   "0532 111 22 33"     → defaultCountryCode verilmişse çevrilir
 *   (verilmemişse)        → null             (ülke kodu tahmin EDİLMEZ)
 *
 * Neden `defaultCountryCode` opsiyonel: operatör panelden "0532 111 22 33"
 * gibi ulusal biçim yapıştırır; "+" veya "00" yoksa ülke kodunu bilmenin tek
 * dürüst yolu operatörün beyanıdır. Aksi hâlde numarayı sessizce yanlış
 * ülkeye atmak (ör. +53 Kolombiya) gönderilen SMS'in sessizce kaybolmasına
 * yol açar — o yüzden belirsiz numara reddedilir ve log'a `skipped` yazılır.
 */
export function normalizePhone(raw, defaultCountryCode = null) {
  if (!raw) return null;
  const hadPlus = String(raw).trim().startsWith('+');
  let digits = String(raw).replace(/\D/g, '');

  if (hadPlus) return /^\+[1-9]\d{7,14}$/.test(`+${digits}`) ? `+${digits}` : null;

  if (digits.startsWith('00')) {
    const rest = digits.slice(2);
    return /^([1-9]\d{7,14})$/.test(rest) ? `+${rest}` : null;
  }

  const cc = String(defaultCountryCode ?? '').replace(/\D/g, '');
  if (cc) {
    const national = digits.replace(/^0+/, '');
    const full = `${cc}${national}`;
    return /^[1-9]\d{7,14}$/.test(full) ? `+${full}` : null;
  }

  return null;
}

export function createTwilioSender({ fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch uygulanamıyor — SMS gönderimi için fetchImpl enjekte edin');

  return async function send({ to, body, from, messagingServiceSid, accountSid, authToken, defaultCountryCode = null }) {
    if (!accountSid || !authToken) {
      return { ok: false, code: 'SMS_CREDENTIALS_MISSING', error: 'Twilio kimlik bilgileri eksik', sid: null, status: 'failed' };
    }
    const target = normalizePhone(to, defaultCountryCode);
    if (!target) {
      return { ok: false, code: 'SMS_INVALID_PHONE', error: `Geçersiz alıcı numarası: ${to}`, sid: null, status: 'failed' };
    }
    if (!from && !messagingServiceSid) {
      return { ok: false, code: 'SMS_SENDER_MISSING', error: 'Gönderici numara veya Messaging Service SID gerekli', sid: null, status: 'failed' };
    }

    const params = new URLSearchParams({ To: target, Body: String(body ?? '') });
    // Messaging Service varsa From GÖNDERİLMEZ — Twilio ikisini birlikte
    // kabul etmez (400 döner).
    if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
    else params.set('From', from);

    const url = `${baseUrl.replace(/\/$/, '')}/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { ok: false, code: 'SMS_NETWORK_ERROR', error: err?.message || 'Ağ hatası', sid: null, status: 'failed' };
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const code = data?.code ? `TWILIO_${data.code}` : `TWILIO_HTTP_${res.status}`;
      const error = data?.message || `Twilio ${res.status} döndü`;
      return {
        ok: false, code, error, sid: data?.sid ?? null, status: 'failed',
        twilioCode: data?.code ?? null,
        meaning: data?.code ? (TWILIO_ERROR_MEANINGS[data.code] ?? null) : null,
      };
    }

    // Twilio 2xx dönse bile mesaj 'failed' statüsünde olabilir (ör. kara liste).
    const status = data?.status || 'queued';
    const ok = status !== 'failed';
    return {
      ok,
      sid: data?.sid ?? null,
      status,
      code: ok ? null : `TWILIO_${data?.error_code ?? 'UNKNOWN'}`,
      error: ok ? null : (data?.error_message || data?.message || 'Twilio mesajı kabul etmedi'),
      // Twilio 2xx dönse bile mesajı sonradan REDDEDEBİLİR (kara liste, kayıtsız
      // gönderici). 30034/30041 gibi kodlar burada gelir.
      twilioCode: data?.error_code ?? null,
      meaning: data?.error_code ? (TWILIO_ERROR_MEANINGS[data.error_code] ?? null) : null,
    };
  };
}

/**
 * Kimlik doğrulama testi — mesaj GÖNDERMEZ.
 * Twilio `GET /Accounts/{Sid}.json` ucu Basic auth'u doğrular ve hesabın
 * durumunu döner; tek kuruş maliyeti yok. Paneldeki "Bağlantıyı Test Et"
 * butonu bunu kullanır (yanlış token'ı canlı mesajla değil, kuru çalışmayla
 * yakalamak için).
 */
export function createTwilioChecker({ fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch uygulanamıyor — SMS testi için fetchImpl enjekte edin');

  return async function check({ accountSid, authToken }) {
    if (!accountSid || !authToken) {
      return { ok: false, code: 'SMS_CREDENTIALS_MISSING', error: 'Twilio kimlik bilgileri eksik' };
    }
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    let res;
    try {
      res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/2010-04-01/Accounts/${accountSid}.json`, {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { ok: false, code: 'SMS_NETWORK_ERROR', error: err?.message || 'Ağ hatası' };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        code: data?.code ? `TWILIO_${data.code}` : `TWILIO_HTTP_${res.status}`,
        error: data?.message || `Twilio ${res.status} döndü`,
        twilioCode: data?.code ?? null,
        meaning: data?.code ? (TWILIO_ERROR_MEANINGS[data.code] ?? null) : null,
      };
    }
    // `type` alanı trial/paid ayrımını verir ("Trial" | "Full" ...). Panelde
    // "bu hesap trial" rozeti bu değerden gelir — elle varsayılmaz.
    const rawType = String(data?.type ?? '').toLowerCase();
    const accountType = rawType.includes('trial') ? 'trial' : 'paid';
    return {
      ok: true,
      code: null,
      error: null,
      accountStatus: data?.status ?? null,
      friendlyName: data?.friendly_name ?? null,
      accountType,
      rawAccountType: data?.type ?? null,
    };
  };
}

const CHECKERS = {
  twilio: createTwilioChecker,
};

export function createChecker(provider, deps = {}) {
  const factory = CHECKERS[provider] || CHECKERS.twilio;
  return factory(deps);
}

const SENDERS = {
  twilio: createTwilioSender,
};

export function createSender(provider, deps = {}) {
  const factory = SENDERS[provider] || SENDERS.twilio;
  return factory(deps);
}

/** Sağlayıcı destekleniyor mu? (bilinmeyen sağlayıcı sessizce twilio'ya düşmesin) */
export function isSupportedProvider(provider) {
  return Object.hasOwn(SENDERS, provider);
}