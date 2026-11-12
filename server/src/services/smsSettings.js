import { decryptSecret, decryptSensitive, encryptSensitive, isEncryptedSecret } from '../utils/secretCrypto.js';
import { mongoLoad, mongoSave } from '../config/secretSettingsStore.js';
import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { tenantContext } from '../tenancy/context.js';
import { maskSecret } from './settings.js';

export const SMS_PROVIDERS = ['twilio'];
const TTL_MS = 30 * 1000;

export const SMS_SETTING_KEYS = [
  'sms.provider',
  'sms.twilio.accountSid',
  'sms.twilio.authToken',
  'sms.twilio.fromNumber',
  'sms.twilio.messagingServiceSid',
  'sms.twilio.defaultCountryCode',
  'sms.accountType',
  'sms.trialSignUpCountry',
];

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

function cacheKey(tenantId, brandId) {
  return `${tenantId ? String(tenantId) : 'platform'}:${brandId ? String(brandId) : 'none'}`;
}

function decryptToken(stored) {
  return isEncryptedSecret(stored) ? decryptSensitive(stored) : decryptSecret(stored);
}

/** Tenant-keyed Twilio settings store with strict multi-mode env isolation. */
export function createSmsSettingsStore({
  load = options => mongoLoad(SMS_SETTING_KEYS, options),
  save = (key, value, adminId, options) => mongoSave(key, value, adminId, options),
  env = process.env,
  now = Date.now,
  ttlMs = TTL_MS,
} = {}) {
  const caches = new Map();

  function resolveContext(options = {}) {
    const ambient = tenantContext.get();
    return {
      tenantId: options.tenantId !== undefined
        ? options.tenantId
        : (ambient?.tenantId ?? (getTenancyMode(env) === 'single' ? getDefaultTenantId() : null)),
      brandId: options.brandId !== undefined ? options.brandId : (ambient?.brandId ?? null),
    };
  }

  async function snapshot(options = {}) {
    const scope = resolveContext(options);
    const key = cacheKey(scope.tenantId, scope.brandId);
    const cached = caches.get(key);
    if (cached && now() - cached.loadedAt < ttlMs) return cached.data;
    let data = {};
    try { data = await load(scope) || {}; } catch { data = {}; }
    caches.set(key, { data, loadedAt: now() });
    return data;
  }

  const allowsEnv = () => getTenancyMode(env) === 'single';

  async function raw(key, options = {}) {
    return (await snapshot(options))[key] || null;
  }

  async function secret(key, options = {}) {
    const stored = await raw(key, options);
    if (stored) {
      try { return decryptToken(stored); } catch { /* unreadable credentials stay unavailable */ }
    }
    return allowsEnv() ? (env[ENV_KEYS[key]] || null) : null;
  }

  async function plain(key, options = {}) {
    const stored = await raw(key, options);
    if (stored) return stored;
    return allowsEnv() ? (env[ENV_KEYS[key]] || null) : null;
  }

  async function sourceOf(key, options = {}) {
    if (await raw(key, options)) return 'db';
    return allowsEnv() && env[ENV_KEYS[key]] ? 'env' : 'unset';
  }

  async function update(patch = {}, { clear = [], adminId, tenantId, brandId, scope } = {}) {
    for (const key of [...Object.keys(patch), ...clear]) {
      if (!SMS_SETTING_KEYS.includes(key)) throw new Error(`Unknown SMS setting: ${key}`);
    }
    const resolved = resolveContext({ tenantId, brandId });
    const effectiveScope = scope || (resolved.brandId ? 'brand' : (resolved.tenantId ? 'tenant' : 'tenant'));
    for (const [key, rawValue] of Object.entries(patch)) {
      const value = rawValue == null ? '' : String(rawValue).trim();
      if (!value && SMS_SECRET_KEYS.has(key)) continue;
      await save(key, value ? (SMS_SECRET_KEYS.has(key) ? encryptSensitive(value) : value) : null, adminId, {
        ...resolved,
        scope: effectiveScope,
      });
    }
    for (const key of clear) {
      await save(key, null, adminId, { ...resolved, scope: effectiveScope });
    }
    caches.delete(cacheKey(resolved.tenantId, resolved.brandId));
  }

  return {
    raw,
    secret,
    plain,
    sourceOf,
    update,
    invalidate(tenantId, brandId) {
      if (tenantId === undefined && brandId === undefined) return caches.clear();
      if (tenantId !== undefined && brandId !== undefined) return caches.delete(cacheKey(tenantId, brandId));
      const prefix = `${tenantId ? String(tenantId) : 'platform'}:`;
      for (const key of caches.keys()) if (key.startsWith(prefix)) caches.delete(key);
    },
  };
}

export const smsSettings = createSmsSettingsStore();
export const invalidateSmsSettings = () => smsSettings.invalidate();

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

export async function persistDetectedAccountType(detected, adminId = null) {
  if (!SMS_ACCOUNT_TYPES.includes(detected) || detected === 'unknown') return false;
  if ((await smsSettings.sourceOf('sms.accountType')) !== 'unset') return false;
  await smsSettings.update({ 'sms.accountType': detected }, { adminId });
  return true;
}

export async function saveSmsSettings(patch, adminId = null) {
  const writes = {};
  if (patch.provider !== undefined) writes['sms.provider'] = String(patch.provider);
  if (patch.accountSid) writes['sms.twilio.accountSid'] = String(patch.accountSid);
  if (patch.fromNumber) writes['sms.twilio.fromNumber'] = String(patch.fromNumber);
  if (patch.messagingServiceSid) writes['sms.twilio.messagingServiceSid'] = String(patch.messagingServiceSid);
  if (patch.defaultCountryCode) writes['sms.twilio.defaultCountryCode'] = String(patch.defaultCountryCode).replace(/\D/g, '');
  if (patch.accountType) {
    if (!SMS_ACCOUNT_TYPES.includes(patch.accountType)) {
      throw new SmsCredentialError(`Geçersiz hesap tipi: ${patch.accountType}`, 'SMS_ACCOUNT_TYPE_INVALID');
    }
    writes['sms.accountType'] = patch.accountType;
  }
  if (patch.trialSignUpCountry) writes['sms.trialSignUpCountry'] = String(patch.trialSignUpCountry).trim().toUpperCase();
  if (patch.authToken) {
    if (!process.env.OPERATOR_SECRET_ENCRYPTION_KEY) {
      throw new SmsCredentialError('OPERATOR_SECRET_ENCRYPTION_KEY tanımlı değil; Auth Token şifrelenerek saklanamaz. Anahtarı .env\'e ekleyin veya token\'ı TWILIO_AUTH_TOKEN ile sunucuya verin.', 'SMS_ENCRYPTION_KEY_MISSING');
    }
    writes['sms.twilio.authToken'] = String(patch.authToken);
  }
  if (Object.keys(writes).length === 0) return getSmsSettingsStatus();
  await smsSettings.update(writes, { adminId });
  return getSmsSettingsStatus();
}
