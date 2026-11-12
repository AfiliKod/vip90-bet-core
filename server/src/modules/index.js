/**
 * Modül kayıt defterinin üretim bağlantısı (M1).
 *
 * DB anahtarı biçimi: `module.<id>.enabled` — mevcut Setting koleksiyonunu
 * (key-value, admin panelinden yazılabilir) kullanır; yeni bir şema açmaz.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createModuleStore, MODULE_DEFINITIONS } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';
import { getCurrentTenantId } from '../tenancy/context.js';
import { getTenancyMode } from '../config/tenancy.js';

const KEY_PREFIX = 'module.';
const KEY_SUFFIX = '.enabled';
const dbKey = id => `${KEY_PREFIX}${id}${KEY_SUFFIX}`;

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createModuleStore({
  load: async () => {
    // DB bağlı değilse mongoose sorguyu buffer'da tutar; erkenden "okunamadı"
    // de (isEnabled bunu kapalı sayar, enabledState bilinmiyor döner).
    if (mongoose.connection.readyState !== 1) throw new Error('DB bağlı değil');
    const keys = MODULE_DEFINITIONS.map(m => dbKey(m.id));
    const raw = await mongoLoad(keys, { tenantId, brandId });
    const flags = {};
    for (const key of keys) {
      if (raw[key] != null) flags[key.slice(KEY_PREFIX.length, -KEY_SUFFIX.length)] = raw[key] === 'true';
    }
    return flags;
  },
}));

export const moduleStore = {
  isEnabled: id => stores.current().isEnabled(id),
  enabledState: id => stores.current().enabledState(id),
  list: () => stores.current().list(),
  invalidate: () => stores.invalidateAll(),
};

export const isModuleEnabled = id => moduleStore.isEnabled(id);
export const listModules = () => moduleStore.list();
export const invalidateModules = () => moduleStore.invalidate();

/** Admin panelinden bir modülü açıp kapatır. */
export async function setModuleEnabled(id, enabled, updatedBy) {
  if (!MODULE_DEFINITIONS.some(m => m.id === id)) {
    throw new Error(`Bilinmeyen modül: ${id}`);
  }
  await saveScopedSetting(dbKey(id), String(!!enabled), updatedBy);
  invalidateModules();
}

/**
 * Yayın öncesi zaten canlı olan modüller: DB'de kaydı yoksa AÇIK olarak tohumlanır
 * (idempotent, `$setOnInsert` — var olan bir kaydı, açık ya da kapalı, asla ezmez).
 * Aksi halde registry'nin "kayıt yok = kapalı" varsayılanı yayından sonra Slikair'i
 * kapatırdı. Yeni kurulumlarda da çalışır; operatör panelden kapatabilir.
 */
export const DEFAULT_ENABLED_MODULES = ['slikair-payment'];

export async function seedDefaultEnabledModules() {
  const ambientTenantId = getTenancyMode() === 'multi' ? getCurrentTenantId() : null;
  for (const id of DEFAULT_ENABLED_MODULES) {
    const key = dbKey(id);
    if (ambientTenantId) {
      await Setting.updateOne(
        { key, scope: 'tenant', tenantId: ambientTenantId, brandId: null },
        { $setOnInsert: { key, value: 'true', scope: 'tenant', tenantId: ambientTenantId, brandId: null } },
        { upsert: true },
      );
    } else {
      await Setting.updateOne(
        { key },
        { $setOnInsert: { key, value: 'true' } },
        { upsert: true },
      );
    }
  }
  invalidateModules();
}
