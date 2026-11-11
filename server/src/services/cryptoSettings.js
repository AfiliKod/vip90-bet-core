import Setting from '../models/Setting.js';
import { createError } from '../middleware/error.js';
import User from '../models/User.js';
import Counter from '../models/Counter.js';
import { CRYPTO_SETTINGS, applyCryptoSettings, cryptoEnvDefaults } from '../config/crypto.js';
import { updateCryptoSettingsSchema } from '../validators/admin.js';

const KEY = 'crypto.settings';
const TTL_MS = 30_000;
const COUNTER_ID = 'cryptoDepositIndex';
let hydratedAt = 0;
let envDefaults = null;

function defaultsFromEnv() {
  if (!envDefaults) envDefaults = cryptoEnvDefaults();
  return envDefaults;
}

// Stored admin overrides: only the keys an admin saved. Missing row → {}.
// Corrupt JSON or invalid shape → null (logged). DB errors propagate.
async function readStored(logger) {
  const row = await Setting.findOne({ key: KEY }).lean();
  if (!row?.value) return {};
  let parsed;
  try { parsed = JSON.parse(row.value); } catch {
    logger.error?.('[crypto-settings] stored crypto.settings is not valid JSON; ignoring it');
    return null;
  }
  const result = updateCryptoSettingsSchema.safeParse(parsed);
  if (!result.success) {
    logger.error?.('[crypto-settings] stored crypto.settings failed validation; ignoring it');
    return null;
  }
  return result.data;
}

// In-memory value = env defaults, then the stored overrides on top.
function applyLayers(defaults, stored) {
  applyCryptoSettings(structuredClone(defaults));
  if (stored) applyCryptoSettings(stored);
}

/**
 * Loads admin-adjusted crypto settings (Setting `crypto.settings`) over the env
 * defaults into the in-memory CRYPTO_SETTINGS. Called at startup (force) and lazily
 * with a 30 s TTL. A corrupt/invalid row is logged and the env defaults apply.
 * DB unreachable: current values stay, retried on the next call. Never throws.
 */
export async function hydrateCryptoSettings({ force = false, logger = console, defaults } = {}) {
  if (!force && Date.now() - hydratedAt < TTL_MS) return;
  try {
    const stored = await readStored(logger);
    applyLayers(defaults || defaultsFromEnv(), stored);
    hydratedAt = Date.now();
  } catch (e) {
    logger.error?.(`[crypto-settings] hydrate failed: ${e.message}`);
  }
}

/**
 * Persists only the keys the admin patched, merged onto the previously stored row
 * (not onto env-derived memory, so untouched keys keep following the environment).
 * The merged row is validated before it is written; the DB write happens before the
 * in-memory change. Returns the live settings.
 */
export async function updateCryptoSettings(patch, adminId, { logger = console, defaults } = {}) {
  const stored = (await readStored(logger)) || {};
  const merged = { ...stored };
  if (patch.deposit) merged.deposit = { ...(stored.deposit || {}), ...patch.deposit };
  if (patch.withdraw) merged.withdraw = { ...(stored.withdraw || {}), ...patch.withdraw };
  if (patch.usdtTryRate !== undefined) merged.usdtTryRate = patch.usdtTryRate;
  if (patch.network !== undefined) merged.network = patch.network;
  const checked = updateCryptoSettingsSchema.safeParse(merged);
  if (!checked.success) {
    throw createError(400, 'VALIDATION_ERROR', 'Invalid crypto settings');
  }
  await Setting.findOneAndUpdate(
    { key: KEY },
    { value: JSON.stringify(checked.data), updatedBy: adminId },
    { upsert: true, new: true },
  );
  applyLayers(defaults || defaultsFromEnv(), checked.data);
  hydratedAt = Date.now();
  return CRYPTO_SETTINGS;
}

/**
 * Hands out the next HD-wallet deposit index (index 0 is the hot wallet).
 * The counter is first raised ($max, never lowered) to the highest index any user
 * already holds, then incremented atomically — so it cannot collide with indices
 * assigned before the counter existed (deploy runs before the migration) and two
 * concurrent callers never get the same number.
 */
export async function nextDepositIndex() {
  const last = await User.findOne({ cryptoDepositIndex: { $type: 'number' } })
    .sort({ cryptoDepositIndex: -1 })
    .select('cryptoDepositIndex')
    .lean();
  const max = Math.max(0, last?.cryptoDepositIndex ?? 0);
  await Counter.updateOne({ _id: COUNTER_ID }, { $max: { seq: max } }, { upsert: true });
  const counter = await Counter.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  ).lean();
  return Math.max(1, counter.seq);
}
