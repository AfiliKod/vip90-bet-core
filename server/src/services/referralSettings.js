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
import { REFERRAL_SETTINGS as DEFAULTS } from '../config/referral.js';
import { mongoLoad as loadScopedSettings } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from './settings.js';

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
  const raw = await loadScopedSettings(Object.values(REFERRAL_KEYS));
  return Object.entries(raw).map(([key, value]) => ({ key, value }));
}

async function mongoSave(entries, updatedBy) {
  for (const [key, value] of entries) await saveScopedSetting(key, value, updatedBy);
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

// Tenant-keyed instances (İP-4 Task 4): the factory cache is per instance, so
// each ambient tenant/brand gets its own — values never leak across tenants.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createReferralSettingsStore({
  load: async () => {
    const raw = await loadScopedSettings(Object.values(REFERRAL_KEYS), { tenantId, brandId });
    return Object.entries(raw).map(([key, value]) => ({ key, value }));
  },
}));

export const referralSettings = {
  get: () => stores.current().get(),
  update: (patch, updatedBy) => stores.current().update(patch, updatedBy),
  invalidate: () => stores.invalidateAll(),
};
export const getReferralSettings = () => referralSettings.get();
