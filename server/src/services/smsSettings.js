/**
 * SMS Gateway ayar deposu — DB önce, `.env` yedek (`services/settings.js`
 * deseninin aynısı: kısa TTL önbellek, `sourceOf` ile panelde rozet).
 *
 * Neden `services/settings.js` yerine ayrı depo: o depo düz metin saklar ve
 * yalnızca alarm kanalları (`ALERT_KEYS`) için kabul edilmiş durumda. Twilio
 * Auth Token bir SAHAYICI'dIR — DB'de düz metin durması kabul edilemez, bu
 * yüzden `utils/secretCrypto.js` (AES-256-GCM) ile şifrelenir. Geri döndürülebilir
 * şifreleme gerekli çünkü sunucu mesajı gönderirken token'ı Twilio'ya sunmak
 * zorunda (aynı gerekçe `secretCrypto.js` başındaki operatör senaryosuyla aynı).
 *
 * `OPERATOR_SECRET_ENCRYPTION_KEY` tanımlı değilse token DB'ye YAZILMAZ; çağıran
 * tarafa açık bir hata döner. .env'den gelen token şifrelenmez — orası zaten
 * JWT_SECRET gibi düz metin duruyor, aynı güven düzeyi.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto.js';
import { maskSecret } from './settings.js';

export const SMS_PROVIDERS = ['twilio'];

const TTL_MS = 30 * 1000;

/** DB'de tutulan ayar anahtarları (panel yalnızca bunları yazabilir). */
export const SMS_SETTING_KEYS = [
  'sms.provider',
  'sms.twilio.accountSid',
  'sms.twilio.authToken',      // şifreli saklanır
  'sms.twilio.fromNumber',
  'sms.twilio.messagingServiceSid',
  'sms.twilio.defaultCountryCode',
  // Hesap seviyesi: trial mı paid mi? Panelden elle de ayarlanabilir, ama
  // gerçek değer Twilio API'sinden okunur (smsGateway.checker → type).
  'sms.accountType',
  'sms.trialSignUpCountry',
];

/** Panelde maskeli gösterilen sırlar (düz değeri asla dönmeyiz). */
export const SMS_SECRET_KEYS = new Set(['sms.twilio.authToken']);

export const SMS_ACCOUNT_TYPES = ['unknown', 'trial', 'paid'];

const ENV_KEYS = {
  'sms.provider': 'SMS_PROVIDER',
  'sms.twilio.accountSid': 'TWILIO_ACCOUNT_SID',
  'sms.twilio.authToken': 'TWILIO_AUTH_TOKEN',
  'sms.twilio.fromNumber': 'TWILIO_FROM_NUMBER',
  'sms.twilio.messagingServiceSid': 'TWILIO_MESSAGING_SERVICE_SID',
  'sms.twilio.defaultCountryCode': 'TWILIO_DEFAULT_COUNTRY_CODE',
  'sms.accountType': 'SMS_ACCOUNT_TYPE',
  'sms.trialSignUpCountry': 'SMS_TRIAL_SIGNUP_COUNTRY',
};

export class SmsCredentialError extends Error {
  constructor(message, code = 'SMS_CREDENTIALS_INCOMPLETE') {
    super(message);
    this.name = 'SmsCredentialError';
    this.code = code;
    this.status = 400;
  }
}

/**
 * İzole depo üretir — `load`/`env` enjekte edilebildiği için DB'siz test edilir.
 */
export function createSmsSettingsStore({ load, env = process.env, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && Date.now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      // DB okunamıyor — .env yedeğiyle devam (alarm hattı mantığı).
      cache = {};
    }
    loadedAt = Date.now();
    return cache;
  }

  /** DB'deki ham (şifreli) değer — UI'a verilmez. */
  async function raw(key) {
    return (await snapshot())[key] || null;
  }

  /** Gerçek (şifre çözülmüş) değer: DB → env → null. */
  async function secret(key) {
    const stored = await raw(key);
    if (stored) {
      try {
        return decryptSecret(stored);
      } catch {
        // Anahtar döndü veya payload bozuk — sessizce env'e düşmek yanıltıcı
        // olur, bu yüzden yoksayılıp aşağıdaki env yedeğine geçilir.
      }
    }
    return env[ENV_KEYS[key]] || null;
  }

  /** Düz (şifre gerektirmeyen) değer: DB → env → null. */
  async function plain(key) {
    const stored = await raw(key);
    if (stored) return stored;
    return env[ENV_KEYS[key]] || null;
  }

  async function sourceOf(key) {
    if (await raw(key)) return 'db';
    if (env[ENV_KEYS[key]]) return 'env';
    return 'unset';
  }

  return {
    secret,
    plain,
    sourceOf,
    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}

/** Uygulama genelinde kullanılan tekil depo. */
export const smsSettings = createSmsSettingsStore({
  load: async () => {
    // mongoose sorgusu bağlanmadan 10 sn buffer'da bekler; gönderim yolu
    // bunu beklemesin, doğrudan env yedeğine düşer.
    if (mongoose.connection.readyState !== 1) return {};
    const rows = await Setting.find({ key: { $in: SMS_SETTING_KEYS } }).lean();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
});

export const invalidateSmsSettings = () => smsSettings.invalidate();

/**
 * Gönderim yolunun kullandığı birleşik yapılandırma.
 * `configured` = gönderim denemesi için asgari kimlik bilgileri var mı
 * (Account SID + Auth Token + gönderici: From numarası VEYA Messaging
 * Service SID). Eksik olanlar panelin "eksik alanlar" listesinde gösterilir.
 */
export function configMissing(cfg = {}) {
  const missing = [];
  if (!cfg.accountSid) missing.push('accountSid');
  if (!cfg.authToken) missing.push('authToken');
  if (!cfg.fromNumber && !cfg.messagingServiceSid) missing.push('sender');
  return missing;
}

export async function getSmsConfig() {
  const provider = (await smsSettings.plain('sms.provider')) || 'twilio';
  const accountSid = await smsSettings.plain('sms.twilio.accountSid');
  const authToken = await smsSettings.secret('sms.twilio.authToken');
  const fromNumber = await smsSettings.plain('sms.twilio.fromNumber');
  const messagingServiceSid = await smsSettings.plain('sms.twilio.messagingServiceSid');
  const defaultCountryCode = await smsSettings.plain('sms.twilio.defaultCountryCode');
  // Twilio API'sinden okunan gerçek tip (bkz. smsGateway.checker → type).
  // Operatör elle ayarlamışsa o kazanır; hiçbiri yoksa 'unknown'.
  //
  // 'unknown' neden varsayılan: 'paid' varsaymak trial hesapta yanlış olurdu
  // (trial kısıtları uygulanmaz, Twilio 14111 döner ve mesajlar boşa gider).
  // 'trial' varsaymak ise ücretli hesapta gönderimi gereksiz engellerdi. Bu
  // yüzden belirsizlikle engellemiyoruz; panel "hesap tipi bilinmiyor, Bağlantıyı
  // Test Et" uyarısı gösteriyor.
  const rawAccountType = await smsSettings.plain('sms.accountType');
  const accountType = ['trial', 'paid'].includes(rawAccountType) ? rawAccountType : 'unknown';
  const trialSignUpCountry = await smsSettings.plain('sms.trialSignUpCountry');

  const missing = configMissing({ accountSid, authToken, fromNumber, messagingServiceSid });
  return {
    defaultCountryCode,
    accountType,
    trialSignUpCountry,
    provider,
    accountSid,
    authToken,
    fromNumber,
    messagingServiceSid,
    missing,
    configured: missing.length === 0,
  };
}

/** Panel için — sırlar maskelenir, yalnızca "var/yok + kaynak" bilgisi verilir. */
export async function getSmsSettingsStatus() {
  const cfg = await getSmsConfig();
  const sources = {};
  for (const key of SMS_SETTING_KEYS) sources[key] = await smsSettings.sourceOf(key);

  return {
    provider: cfg.provider,
    accountSid: cfg.accountSid,
    accountSidMasked: maskSecret(cfg.accountSid),
    accountSidSource: sources['sms.twilio.accountSid'],
    authTokenConfigured: Boolean(cfg.authToken),
    authTokenMasked: maskSecret(cfg.authToken),
    authTokenSource: sources['sms.twilio.authToken'],
    fromNumber: cfg.fromNumber,
    fromNumberSource: sources['sms.twilio.fromNumber'],
    messagingServiceSid: cfg.messagingServiceSid,
    messagingServiceSidSource: sources['sms.twilio.messagingServiceSid'],
    defaultCountryCode: cfg.defaultCountryCode,
    defaultCountryCodeSource: sources['sms.twilio.defaultCountryCode'],
    accountType: cfg.accountType,
    accountTypeSource: sources['sms.accountType'],
    trialSignUpCountry: cfg.trialSignUpCountry,
    trialSignUpCountrySource: sources['sms.trialSignUpCountry'],
    configured: cfg.configured,
    missing: cfg.missing ?? configMissing(cfg),
    encryptionKeyAvailable: Boolean(process.env.OPERATOR_SECRET_ENCRYPTION_KEY),
  };
}

/**
 * "Bağlantıyı Test Et" sırasında Twilio API'sinden gelen gerçek hesap tipini
 * kalıcılaştırır — AMA operatör elle bir değer girdiyse onu EZMEZ.
 * Bu sayede "test et" dediğinde panel gerçek durumu (trial/paid) gösterir,
 * elle girdiği değer de yanlışlıkla silinmez.
 */
export async function persistDetectedAccountType(detected, adminId = null) {
  if (!SMS_ACCOUNT_TYPES.includes(detected) || detected === 'unknown') return false;
  if ((await smsSettings.sourceOf('sms.accountType')) !== 'unset') return false;
  await Setting.updateOne(
    { key: 'sms.accountType' },
    { $set: { key: 'sms.accountType', value: detected, updatedBy: adminId } },
    { upsert: true },
  );
  invalidateSmsSettings();
  return true;
}

/**
 * Panelden kayıt. Boş string gönderilen alanlar "değiştirme" değildir —
 * hiç gönderilmezse mevcut değer korunur (Igames/Slikair deseni).
 * `authToken` şifrelenir; şifreleme anahtarı yoksa yazılmaz ve hata döner.
 */
export async function saveSmsSettings(patch, adminId = null) {
  const writes = [];

  if (patch.provider !== undefined) writes.push(['sms.provider', String(patch.provider)]);
  if (patch.accountSid) writes.push(['sms.twilio.accountSid', String(patch.accountSid)]);
  if (patch.fromNumber) writes.push(['sms.twilio.fromNumber', String(patch.fromNumber)]);
  if (patch.messagingServiceSid) writes.push(['sms.twilio.messagingServiceSid', String(patch.messagingServiceSid)]);
  if (patch.defaultCountryCode) writes.push(['sms.twilio.defaultCountryCode', String(patch.defaultCountryCode).replace(/\D/g, '')]);
  if (patch.accountType) {
    if (!SMS_ACCOUNT_TYPES.includes(patch.accountType)) {
      throw new SmsCredentialError(`Geçersiz hesap tipi: ${patch.accountType}`, 'SMS_ACCOUNT_TYPE_INVALID');
    }
    writes.push(['sms.accountType', patch.accountType]);
  }
  if (patch.trialSignUpCountry) writes.push(['sms.trialSignUpCountry', String(patch.trialSignUpCountry).trim().toUpperCase()]);

  if (patch.authToken) {
    if (!process.env.OPERATOR_SECRET_ENCRYPTION_KEY) {
      throw new SmsCredentialError(
        'OPERATOR_SECRET_ENCRYPTION_KEY tanımlı değil; Auth Token şifrelenerek saklanamaz. Anahtarı .env\'e ekleyin veya token\'ı TWILIO_AUTH_TOKEN ile sunucuya verin.',
        'SMS_ENCRYPTION_KEY_MISSING',
      );
    }
    writes.push(['sms.twilio.authToken', encryptSecret(String(patch.authToken))]);
  }

  if (writes.length === 0) return getSmsSettingsStatus();

  await Setting.bulkWrite(
    writes.map(([key, value]) => ({
      updateOne: { filter: { key }, update: { $set: { key, value, updatedBy: adminId } }, upsert: true },
    })),
  );
  invalidateSmsSettings();
  return getSmsSettingsStatus();
}