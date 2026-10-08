/**
 * Referans komisyonu ayarları — `Setting` koleksiyonunda kalıcı.
 *
 * Eskiden `PUT /api/admin/referral/settings` yalnız bellekteki
 * `REFERRAL_SETTINGS` nesnesini değiştiriyordu: restart/deploy değeri sessizce
 * varsayılana döndürüyor, birden fazla süreçte her süreç farklı oran
 * kullanıyordu. Artık değer DB'de; kayıt yoksa `config/referral.js`
 * varsayılanları geçerli. 30 sn önbellek: başka bir süreçte yapılan değişiklik
 * en geç bu sürede görünür (`services/settings.js` ile aynı süre).
 *
 * DB okunamazsa varsayılanlara düşülür (komisyon ödemesi durmaz).
 */
import Setting from '../models/Setting.js';
import { REFERRAL_SETTINGS as DEFAULTS } from '../config/referral.js';

const TTL_MS = 30 * 1000;
export const REFERRAL_KEYS = { enabled: 'referral.enabled', commissionRate: 'referral.commissionRate' };

function parse(rows) {
  const out = { ...DEFAULTS };
  for (const { key, value } of rows) {
    if (key === REFERRAL_KEYS.enabled && (value === 'true' || value === 'false')) out.enabled = value === 'true';
    if (key === REFERRAL_KEYS.commissionRate) {
      const rate = Number(value);
      if (value !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 100) out.commissionRate = rate;
    }
  }
  return out;
}

async function mongoLoad() {
  return Setting.find({ key: { $in: Object.values(REFERRAL_KEYS) } }).select('key value').lean();
}

async function mongoSave(entries, updatedBy) {
  await Setting.bulkWrite(entries.map(([key, value]) => ({
    updateOne: { filter: { key }, update: { $set: { value, updatedBy } }, upsert: true },
  })));
}

export function createReferralSettingsStore({ load = mongoLoad, save = mongoSave, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function get() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = parse(await load());
    } catch {
      cache = { ...DEFAULTS };
    }
    loadedAt = now();
    return cache;
  }

  async function update({ enabled, commissionRate } = {}, updatedBy = null) {
    const entries = [];
    if (typeof enabled === 'boolean') entries.push([REFERRAL_KEYS.enabled, String(enabled)]);
    if (commissionRate !== undefined) entries.push([REFERRAL_KEYS.commissionRate, String(commissionRate)]);
    if (entries.length) await save(entries, updatedBy);
    cache = null;
    return get();
  }

  return { get, update, invalidate: () => { cache = null; } };
}

export const referralSettings = createReferralSettingsStore();
export const getReferralSettings = () => referralSettings.get();
