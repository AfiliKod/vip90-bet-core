/**
 * Entegrasyon ayarları için ortak okuyucu/yazıcı (Slikair, SMTP vb.).
 *
 * Çok kiracılı (multi-tenant) hiyerarşik yapı ve kiracı izolasyonu (İP-4, G6).
 * Kapsam önceliği (Scope precedence):
 *   Marka (brand) > Kiracı (tenant) > Platform > Eski (legacy un-scoped).
 *
 * Çok kiracılı modda (TENANCY_MODE=multi), kiracı kimlik bilgileri ve ayarları
 * ASLA ortam değişkenlerine (env) düşmez (leak prevention). Yalnızca platform
 * kapsamındaki alanlar (scope: 'platform') veya single mod env okuyabilir.
 *
 * Önbellek kiracı/marka bazında `${tenantId || 'platform'}:${brandId || 'none'}`
 * anahtarıyla ayrıştırılır.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto.js';
import { tenantContext, getCurrentTenantId } from '../tenancy/context.js';
import { getTenancyMode } from './tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';

const TTL_MS = 30 * 1000;

export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function toObjectIdOrNull(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return id;
}

function getCacheKey(tenantId, brandId) {
  const t = tenantId ? String(tenantId) : 'platform';
  const b = brandId ? String(brandId) : 'none';
  return `${t}:${b}`;
}

/**
 * @param {object} o
 * @param {string} o.prefix  DB anahtar öneki, ör. 'slikair' -> 'slikair.merchantId'
 * @param {Array<{name:string,env:string,secret?:boolean,default?:string,scope?:'platform'|'tenant'|'brand'}>} o.fields
 * @param {string} [o.scope] Depo genel kapsamı (ör. 'platform')
 */
export function createSecretSettingsStore({
  prefix,
  fields,
  load = mongoLoad,
  save = mongoSave,
  scope: storeScope,
  env = process.env,
  encrypt = encryptSecret,
  decrypt = decryptSecret,
  now = Date.now,
  ttlMs = TTL_MS,
}) {
  const dbKey = name => `${prefix}.${name}`;
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));
  const caches = new Map(); // cacheKey -> { data, loadedAt }
  const listeners = [];

  function resolveContext(options = {}) {
    const ambient = tenantContext.get();
    let effectiveTenantId = options?.tenantId !== undefined
      ? options.tenantId
      : (ambient?.tenantId ?? (getTenancyMode(env) === 'single' ? getDefaultTenantId() : null));
    let effectiveBrandId = options?.brandId !== undefined
      ? options.brandId
      : (ambient?.brandId ?? null);

    return { effectiveTenantId, effectiveBrandId };
  }

  async function snapshotInternal(effectiveTenantId, effectiveBrandId) {
    const key = getCacheKey(effectiveTenantId, effectiveBrandId);
    const entry = caches.get(key);
    if (entry && (now() - entry.loadedAt < ttlMs)) {
      return entry.data;
    }
    const out = {};
    try {
      const raw = await load(fields.map(f => dbKey(f.name)), {
        tenantId: effectiveTenantId,
        brandId: effectiveBrandId,
      });
      if (raw) {
        for (const f of fields) {
          const v = raw[dbKey(f.name)];
          if (!v) continue;
          if (f.secret) {
            try { out[f.name] = decrypt(v); } catch { /* çözülemedi: env'e düş */ }
          } else {
            out[f.name] = v;
          }
        }
      }
    } catch {
      // DB load error
    }
    caches.set(key, { data: out, loadedAt: now() });
    return out;
  }

  function invalidate(tenantId, brandId) {
    let tid = tenantId;
    let bid = brandId;
    if (tenantId && typeof tenantId === 'object' && !(tenantId instanceof mongoose.Types.ObjectId) && !tenantId._bsontype) {
      tid = tenantId.tenantId;
      bid = tenantId.brandId;
    }

    if (tid === undefined && bid === undefined) {
      caches.clear();
    } else if (tid !== undefined && bid !== undefined) {
      const key = getCacheKey(tid, bid);
      caches.delete(key);
    } else if (tid !== undefined) {
      const prefixKey = `${tid ? String(tid) : 'platform'}:`;
      for (const k of caches.keys()) {
        if (k.startsWith(prefixKey)) caches.delete(k);
      }
    } else {
      caches.clear();
    }
    for (const fn of listeners) fn();
  }

  function resolve(f, db) {
    if (db[f.name]) return { value: db[f.name], source: 'db' };

    const mode = getTenancyMode(env);
    const isPlatform = f.scope === 'platform' || storeScope === 'platform';
    const allowEnv = mode === 'single' || isPlatform;

    if (allowEnv && env[f.env]) return { value: env[f.env], source: 'env' };
    if (f.default != null && f.default !== '') return { value: f.default, source: 'default' };
    return { value: f.default ?? '', source: 'unset' };
  }

  return {
    /** Etkin değerlerin düz haritası (sunucu içi kullanım; asla panele verilmez). */
    async getAll(options = {}) {
      const { effectiveTenantId, effectiveBrandId } = resolveContext(options);
      const db = await snapshotInternal(effectiveTenantId, effectiveBrandId);
      return Object.fromEntries(fields.map(f => [f.name, resolve(f, db).value]));
    },

    /** Panel görünümü: gizli alanlar maskeli, kaynak bilgisiyle. */
    async getAdminView(options = {}) {
      const { effectiveTenantId, effectiveBrandId } = resolveContext(options);
      const db = await snapshotInternal(effectiveTenantId, effectiveBrandId);
      return fields.map(f => {
        const { value, source } = resolve(f, db);
        return {
          key: f.name,
          value: f.secret ? maskSecret(value) : (value || null),
          source,
          secret: !!f.secret,
          configured: !!value,
        };
      });
    },

    /**
     * patch: { [name]: string }. Gizli alanda boş/eksik değer = DEĞİŞMEZ.
     * Gizli olmayan alanda boş string = DB kaydını sil (env'e geri dön).
     * clear: gizli alanı da DB'den silmek için isim listesi (env'e geri dön).
     */
    async update(patch = {}, { clear = [], adminId, tenantId, brandId, scope } = {}) {
      for (const name of Object.keys(patch)) {
        if (!byName[name]) throw new Error(`Bilinmeyen ayar: ${name}`);
      }
      for (const name of clear) {
        if (!byName[name]) throw new Error(`Bilinmeyen ayar: ${name}`);
      }

      const { effectiveTenantId, effectiveBrandId } = resolveContext({ tenantId, brandId });
      const ambient = tenantContext.get();
      const effectiveScope = scope !== undefined
        ? scope
        : (storeScope || (effectiveBrandId ? 'brand' : (effectiveTenantId ? 'tenant' : (ambient?.mode === 'platform' ? 'platform' : 'tenant'))));

      const ops = [];
      for (const [name, raw] of Object.entries(patch)) {
        const f = byName[name];
        const value = raw == null ? '' : String(raw).trim();
        if (value) {
          ops.push([dbKey(name), f.secret ? encrypt(value) : value]);
        } else if (!f.secret) {
          ops.push([dbKey(name), null]);
        }
      }
      for (const name of clear) ops.push([dbKey(name), null]);

      for (const [key, value] of ops) {
        await save(key, value, adminId, {
          tenantId: effectiveTenantId,
          brandId: effectiveBrandId,
          scope: effectiveScope,
        });
      }
      invalidate(effectiveTenantId, effectiveBrandId);
    },

    async snapshot(options = {}) {
      const { effectiveTenantId, effectiveBrandId } = resolveContext(options);
      return snapshotInternal(effectiveTenantId, effectiveBrandId);
    },

    onChange(fn) { listeners.push(fn); },
    invalidate,
  };
}

export const mongoLoad = async (keys, options = {}) => {
  if (mongoose.connection.readyState !== 1) return {};
  if (!keys || keys.length === 0) return {};

  const ambient = tenantContext.get();
  const effectiveTenantId = options?.tenantId !== undefined
    ? options.tenantId
    : (ambient?.tenantId ?? (getTenancyMode() === 'single' ? getDefaultTenantId() : null));
  const effectiveBrandId = options?.brandId !== undefined
    ? options.brandId
    : (ambient?.brandId ?? null);

  const tid = toObjectIdOrNull(effectiveTenantId);
  const bid = toObjectIdOrNull(effectiveBrandId);

  const orConditions = [];

  if (tid) {
    if (bid) {
      orConditions.push({ key: { $in: keys }, scope: 'brand', tenantId: tid, brandId: bid });
    }
    orConditions.push({ key: { $in: keys }, scope: 'tenant', tenantId: tid });
  } else if (getTenancyMode() === 'single') {
    orConditions.push({ key: { $in: keys }, scope: 'tenant', tenantId: null });
  }

  // Platform scope rows are candidates in both single and multi mode
  orConditions.push({ key: { $in: keys }, scope: 'platform' });

  // Legacy rows: tenantId null or missing, scope null or missing or not brand/tenant
  orConditions.push({
    key: { $in: keys },
    tenantId: null,
    $or: [
      { scope: { $exists: false } },
      { scope: null },
      { scope: { $nin: ['platform', 'tenant', 'brand'] } },
    ],
  });

  // In single mode with no tid, also allow legacy rows with no scope
  if (getTenancyMode() === 'single' && !tid) {
    orConditions.push({ key: { $in: keys }, scope: { $exists: false } });
  }

  const rows = await Setting.find({ $or: orConditions }).lean();

  const result = {};
  const ranks = {};

  for (const r of rows) {
    let rank = 1; // legacy un-scoped default
    if (tid && bid && r.scope === 'brand' && String(r.tenantId) === String(tid) && String(r.brandId) === String(bid)) {
      rank = 4;
    } else if (tid && r.scope === 'tenant' && String(r.tenantId) === String(tid)) {
      rank = 3;
    } else if (r.scope === 'platform') {
      rank = 2;
    } else if (r.scope === 'tenant' && !r.tenantId) {
      rank = 1.5;
    }

    if (!ranks[r.key] || rank > ranks[r.key]) {
      ranks[r.key] = rank;
      result[r.key] = r.value;
    }
  }

  return result;
};

export const mongoSave = async (key, value, adminId, options = {}) => {
  if (mongoose.connection.readyState !== 1) return;
  const ambient = tenantContext.get();
  const effectiveTenantId = options?.tenantId !== undefined
    ? options.tenantId
    : (ambient?.tenantId ?? null);
  const effectiveBrandId = options?.brandId !== undefined
    ? options.brandId
    : (ambient?.brandId ?? null);
  const effectiveScope = options?.scope !== undefined
    ? options.scope
    : (effectiveBrandId ? 'brand' : (effectiveTenantId ? 'tenant' : (ambient?.mode === 'platform' ? 'platform' : 'tenant')));

  const tid = toObjectIdOrNull(effectiveTenantId);
  const bid = toObjectIdOrNull(effectiveBrandId);

  const filter = { key, scope: effectiveScope, tenantId: tid, brandId: bid };

  if (value == null) {
    if (getTenancyMode() === 'single' && !tid) {
      await Setting.deleteOne({ key });
    } else {
      await Setting.deleteOne(filter);
    }
    return;
  }

  // If in single mode, check if an existing row with just { key } exists (legacy compatibility)
  if (getTenancyMode() === 'single') {
    const existing = await Setting.findOne({ key });
    if (existing) {
      await Setting.updateOne(
        { _id: existing._id },
        {
          $set: {
            value,
            scope: effectiveScope || existing.scope,
            tenantId: tid || existing.tenantId || null,
            brandId: bid || existing.brandId || null,
            updatedBy: adminId,
          },
        }
      );
      return;
    }
  }

  await Setting.updateOne(
    filter,
    {
      $set: {
        value,
        scope: effectiveScope,
        tenantId: tid,
        brandId: bid,
        updatedBy: adminId,
      },
    },
    { upsert: true }
  );
};
