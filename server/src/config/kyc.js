import { decryptSensitive, encryptSensitive, isEncryptedSecret } from '../utils/secretCrypto.js';
import { mongoLoad, mongoSave } from './secretSettingsStore.js';
import { getTenancyMode } from './tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { tenantContext } from '../tenancy/context.js';

const KYC_KEYS = [
  'KYC_ENABLED',
  'KYC_PROVIDER',
  'SUMSUB_APP_TOKEN',
  'SUMSUB_SECRET_KEY',
  'SUMSUB_LEVEL_NAME',
  'SUMSUB_WEBHOOK_SECRET',
  'KYC_FAILURE_POLICY',
];

const KYC_DEFAULTS = {
  KYC_ENABLED: 'true',
  KYC_PROVIDER: 'manual',
  SUMSUB_LEVEL_NAME: 'basic-kyc-level',
  KYC_FAILURE_POLICY: 'block',
};

const KYC_SECRET_KEYS = new Set(['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_WEBHOOK_SECRET']);

export const KYC_SECRET_SETTING_KEYS = [...KYC_SECRET_KEYS];

const TTL_MS = 30 * 1000;
const warnedPlain = new Set();

function cacheKey(tenantId, brandId) {
  return `${tenantId ? String(tenantId) : 'platform'}:${brandId ? String(brandId) : 'none'}`;
}

function decryptStored(key, value) {
  if (!value || !KYC_SECRET_KEYS.has(key)) return value;
  if (!isEncryptedSecret(value)) {
    if (!warnedPlain.has(key)) {
      warnedPlain.add(key);
      console.warn(`[kyc] ${key} is plaintext; it will be encrypted on its next write`);
    }
    return value;
  }
  return decryptSensitive(value);
}

export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Per-tenant Sumsub/KYC settings store with scoped cache entries. */
export function createKycConfigStore({
  load = options => mongoLoad(KYC_KEYS, options),
  env = process.env,
  now = Date.now,
  ttlMs = TTL_MS,
  write = (key, value, adminId, options) => mongoSave(key, value, adminId, options),
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
    try {
      data = await load(scope) || {};
    } catch {
      data = {};
    }
    caches.set(key, { data, loadedAt: now() });
    return data;
  }

  const allowsEnv = () => getTenancyMode(env) === 'single';

  async function get(key, options = {}) {
    const fromDb = decryptStored(key, (await snapshot(options))[key]);
    if (fromDb) return fromDb;
    if (KYC_DEFAULTS[key]) return KYC_DEFAULTS[key];
    return allowsEnv() ? (env[key] || null) : null;
  }

  async function sourceOf(key, options = {}) {
    if ((await snapshot(options))[key]) return 'db';
    if (KYC_DEFAULTS[key]) return 'default';
    if (allowsEnv() && env[key]) return 'env';
    return 'unset';
  }

  async function getAll(options = {}) {
    const dbValues = await snapshot(options);
    return KYC_KEYS.map(key => {
      const secret = KYC_SECRET_KEYS.has(key);
      let plain = null;
      if (secret) {
        try { plain = decryptStored(key, dbValues[key]); } catch { plain = null; }
      }
      const envValue = allowsEnv() ? env[key] : null;
      const value = secret
        ? (plain || (dbValues[key] ? null : envValue) || null)
        : (dbValues[key] || KYC_DEFAULTS[key] || envValue || null);
      const source = dbValues[key] ? 'db' : (KYC_DEFAULTS[key] ? 'default' : (envValue ? 'env' : 'unset'));
      return {
        key,
        value: secret ? maskSecret(value) : (value || null),
        rawValue: secret ? null : value,
        source,
        secret,
      };
    });
  }

  async function set(key, value, adminId, options = {}) {
    if (!KYC_KEYS.includes(key)) throw new Error(`Unknown KYC key: ${key}`);
    const secret = KYC_SECRET_KEYS.has(key);
    if (secret && value) {
      const text = String(value);
      if (text.includes('…') || text === '••••') return;
    }
    const stored = value ? (secret ? encryptSensitive(String(value)) : String(value)) : null;
    const scope = resolveContext(options);
    await write(key, stored, adminId, scope);
    caches.delete(cacheKey(scope.tenantId, scope.brandId));
  }

  return {
    get,
    getAll,
    sourceOf,
    set,
    async save(patch = {}, { adminId, ...options } = {}) {
      for (const [key, value] of Object.entries(patch)) await set(key, value, adminId, options);
    },
    invalidate(tenantId, brandId) {
      if (tenantId === undefined && brandId === undefined) return caches.clear();
      if (tenantId !== undefined && brandId !== undefined) return caches.delete(cacheKey(tenantId, brandId));
      const prefix = `${tenantId ? String(tenantId) : 'platform'}:`;
      for (const key of caches.keys()) if (key.startsWith(prefix)) caches.delete(key);
    },
  };
}

export const kycConfig = createKycConfigStore({
  load: options => mongoLoad(KYC_KEYS, options),
  write: (key, value, adminId, options) => mongoSave(key, value, adminId, options),
});
