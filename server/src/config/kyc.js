import mongoose from 'mongoose';
import Setting from '../models/Setting.js';

const KYC_KEYS = [
  'KYC_ENABLED',
  'KYC_PROVIDER',
  'SUMSUB_APP_TOKEN',
  'SUMSUB_SECRET_KEY',
  'SUMSUB_LEVEL_NAME',
  'SUMSUB_WEBHOOK_SECRET',
];

const KYC_DEFAULTS = {
  KYC_ENABLED: 'true',
  KYC_PROVIDER: 'manual',
  SUMSUB_LEVEL_NAME: 'basic-kyc-level',
};

const KYC_SECRET_KEYS = new Set(['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_WEBHOOK_SECRET']);

const TTL_MS = 30 * 1000;

export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function createKycConfigStore({ load, env = process.env, now = Date.now, ttlMs = TTL_MS } = {}) {
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
      const fromDb = (await snapshot())[key];
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
        const value = dbValues[key] || KYC_DEFAULTS[key] || env[key] || null;
        const source = dbValues[key] ? 'db' : (env[key] ? 'env' : (KYC_DEFAULTS[key] ? 'default' : 'unset'));
        return {
          key,
          value: KYC_SECRET_KEYS.has(key) ? maskSecret(value) : (value || null),
          rawValue: value,
          source,
          secret: KYC_SECRET_KEYS.has(key),
        };
      });
    },
    async set(key, value, adminId) {
      if (!KYC_KEYS.includes(key)) throw new Error(`Unknown KYC key: ${key}`);
      if (value) {
        await Setting.findOneAndUpdate(
          { key },
          { value, updatedBy: adminId },
          { upsert: true, new: true },
        );
      } else {
        await Setting.deleteOne({ key });
      }
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
