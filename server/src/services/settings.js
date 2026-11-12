/**
 * Çalışma anı ayarları — DB önce, `.env` yedek.
 *
 * Alarm kanalları eskiden yalnızca `process.env`'den okunuyordu; sunucuya SSH
 * erişimi olmadan konfigüre edilemiyor, bu yüzden de prod'da boş kalmıştı.
 * Burası admin panelinden yönetilen değerleri öne alır, env'i yedekte tutar:
 * DB erişilemese bile alarm hattı env ile ayakta kalır.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { tenantContext, getCurrentTenantId } from '../tenancy/context.js';
import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';

/** Admin panelinden yönetilen anahtarlar. Panel yalnızca bunları yazabilir. */
export const ALERT_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'ALERT_WEBHOOK_URL',
  'ALERT_EMAIL_TO',
];

/** Panelde açık gösterilmeyen anahtarlar. */
export const SECRET_KEYS = new Set(['TELEGRAM_BOT_TOKEN', 'ALERT_WEBHOOK_URL']);

const TTL_MS = 30 * 1000;

/** Secret'ı panelde gösterilebilir hale getirir: `8412…9f3a`. */
export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * İzole bir ayar deposu üretir. `load`, `env` ve `now` enjekte edilebilir olduğu
 * için depo DB'siz test edilebilir.
 */
export function createSettingsStore({ load, env = process.env, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      // DB okunamıyor — env yedeğiyle devam et, alarm hattı ayakta kalsın.
      cache = {};
    }
    loadedAt = now();
    return cache;
  }

  return {
    /** DB değeri varsa onu, yoksa env'i, o da yoksa null döner. */
    async get(key) {
      const fromDb = (await snapshot())[key];
      if (fromDb) return fromDb;
      return env[key] || null;
    },
    /** Hangi kaynaktan geldiğini söyler — panelde rozet olarak gösterilir. */
    async sourceOf(key) {
      if ((await snapshot())[key]) return 'db';
      if (env[key]) return 'env';
      return 'unset';
    },
    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}

/** Uygulama genelinde kullanılan tekil depo. */
export const settings = createSettingsStore({
  load: async () => {
    // DB bağlı değilse mongoose sorguyu 10 sn buffer'da tutar; alarm o kadar
    // gecikmesin diye doğrudan env yedeğine düşülür.
    if (mongoose.connection.readyState !== 1) return {};
    // Ops alert channels are platform-wide (İP-4): only tenantId-null rows
    // qualify, so a tenant-owned row can never redirect the platform's alerts.
    const rows = await Setting.find({ key: { $in: ALERT_KEYS }, tenantId: null }).lean();
    const byKey = new Map();
    for (const r of rows) {
      const prev = byKey.get(r.key);
      if (!prev || (r.scope === 'platform' && prev.scope !== 'platform')) byKey.set(r.key, r);
    }
    return Object.fromEntries([...byKey.values()].map(r => [r.key, r.value]));
  },
});

export const getSetting = key => settings.get(key);
export const getSettingSource = key => settings.sourceOf(key);
export const invalidateSettings = () => settings.invalidate();

/**
 * Scoped Setting write shared by the content/module/crypto stores (İP-4 Task 4).
 * Single mode keeps the legacy one-row-per-key upsert (existing installs read
 * exactly what they wrote); multi mode upserts the ambient tenant/brand row.
 */
export async function saveScopedSetting(key, value, updatedBy) {
  const ambient = tenantContext.get();
  const mode = getTenancyMode();
  const tid = ambient?.tenantId ?? (mode === 'single' ? getDefaultTenantId() : null);
  const bid = ambient?.brandId ?? null;
  if (mode === 'single') {
    const update = { value, updatedBy };
    // Post-boot, stamp the default tenant so scoped reads keep finding the row.
    if (tid) { update.scope = 'tenant'; update.tenantId = tid; update.brandId = bid; }
    await Setting.findOneAndUpdate({ key }, update, { upsert: true, new: true });
    return;
  }
  const scope = bid ? 'brand' : tid ? 'tenant' : ambient?.mode === 'platform' ? 'platform' : 'tenant';
  await Setting.findOneAndUpdate(
    { key, scope, tenantId: tid, brandId: bid },
    { value, updatedBy },
    { upsert: true, new: true },
  );
}

/**
 * Tenant-keyed store partitioning (İP-4 Task 4): one underlying store instance
 * per ambient `tenantId[:brandId]`, so the registries' single-cache factories
 * never share cached values across tenants. `invalidateAll()` clears every
 * bucket — an admin write may change any tenant's effective view.
 */
export function createTenantStoreFacade(build) {
  const instances = new Map();
  return {
    current() {
      const tenantId = getCurrentTenantId() ?? (getTenancyMode() === 'single' ? getDefaultTenantId() : null);
      const brandId = tenantContext.get()?.brandId ?? null;
      const key = `${tenantId ? String(tenantId) : 'global'}:${brandId ? String(brandId) : 'none'}`;
      let instance = instances.get(key);
      if (!instance) {
        instance = build({ tenantId, brandId });
        instances.set(key, instance);
      }
      return instance;
    },
    invalidateAll() {
      for (const instance of instances.values()) instance.invalidate();
    },
  };
}
