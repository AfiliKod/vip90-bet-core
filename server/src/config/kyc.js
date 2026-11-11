import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { encryptSensitive, decryptSensitive, isEncryptedSecret } from '../utils/secretCrypto.js';

const KYC_KEYS = [
  'KYC_ENABLED',
  'KYC_PROVIDER',
  'SUMSUB_APP_TOKEN',
  'SUMSUB_SECRET_KEY',
  'SUMSUB_LEVEL_NAME',
  'SUMSUB_WEBHOOK_SECRET',
  // Çekim kapısı KYC durumunu denetleyemediğinde ne olsun: 'block' (çekim
  // durur) ya da 'allow' (çekim KYC'siz geçer). Bkz. middleware/kycGate.js.
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

// Şifre çözülemezse bilerek throw eder (env'e düşmez; secretSettingsStore'dan farklı): yanlış/eksik anahtar sessizce başka bir sırra dönmesin.
function decryptStored(key, value) {
  if (!value) return value;
  if (!KYC_SECRET_KEYS.has(key)) return value;
  if (!isEncryptedSecret(value)) {
    if (!warnedPlain.has(key)) {
      warnedPlain.add(key);
      console.warn(`[kyc] ${key} düz metin; ilk yazımda şifrelenecek`);
    }
    return value;
  }
  return decryptSensitive(value);
}

async function defaultWrite(key, stored, adminId) {
  if (stored) {
    await Setting.findOneAndUpdate({ key }, { value: stored, updatedBy: adminId }, { upsert: true, new: true });
  } else {
    await Setting.deleteOne({ key });
  }
}

export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function createKycConfigStore({ load, env = process.env, now = Date.now, ttlMs = TTL_MS, write = defaultWrite } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = {};
    }
    loadedAt = now();
    return cache;
  }

  return {
    async get(key) {
      const fromDb = decryptStored(key, (await snapshot())[key]);
      if (fromDb) return fromDb;
      if (KYC_DEFAULTS[key]) return KYC_DEFAULTS[key];
      return env[key] || null;
    },
    async sourceOf(key) {
      if ((await snapshot())[key]) return 'db';
      if (env[key]) return 'env';
      if (KYC_DEFAULTS[key]) return 'default';
      return 'unset';
    },
    async getAll() {
      const dbValues = await snapshot();
      return KYC_KEYS.map(key => {
        const isSecret = KYC_SECRET_KEYS.has(key);
        let plain = null;
        if (isSecret) {
          try { plain = decryptStored(key, dbValues[key]); } catch { plain = null; }
        }
        const value = isSecret
          ? (plain || (dbValues[key] ? null : env[key]) || null)
          : (dbValues[key] || KYC_DEFAULTS[key] || env[key] || null);
        const source = dbValues[key] ? 'db' : (env[key] ? 'env' : (KYC_DEFAULTS[key] ? 'default' : 'unset'));
        return {
          key,
          value: isSecret ? maskSecret(value) : (value || null),
          rawValue: isSecret ? null : value,
          source,
          secret: isSecret,
        };
      });
    },
    async set(key, value, adminId) {
      if (!KYC_KEYS.includes(key)) throw new Error(`Unknown KYC key: ${key}`);
      const isSecret = KYC_SECRET_KEYS.has(key);
      if (isSecret && value) {
        // Maskelenmiş değer (formdan geri gelen) mevcut sırrın üzerine yazılmaz.
        const text = String(value);
        if (text.includes('…') || text === '••••') return;
      }
      const stored = value ? (isSecret ? encryptSensitive(String(value)) : value) : null;
      await write(key, stored, adminId);
      cache = null;
      loadedAt = 0;
    },
    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}

export const kycConfig = createKycConfigStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return {};
    const rows = await Setting.find({ key: { $in: KYC_KEYS } }).lean();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
});
