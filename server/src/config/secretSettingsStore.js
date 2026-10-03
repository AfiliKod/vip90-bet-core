/**
 * Entegrasyon ayarları için ortak okuyucu/yazıcı (Slikair, SMTP).
 *
 * Öncelik: DB değeri > ortam değişkeni > varsayılan. Gizli alanlar DB'ye
 * AES-256-GCM ile şifreli yazılır (utils/secretCrypto.js), panele yalnızca
 * maskeli döner; güncellemede boş gönderilen gizli alan DEĞİŞMEZ. Şifresi
 * çözülemeyen kayıt (anahtar değişti/bozuk) yok sayılır ve env'e düşülür —
 * çalışan canlı ayar hiçbir koşulda bozulmaz.
 *
 * DI deseni config/kyc.js ile aynı: load/save dışarıdan enjekte, kısa TTL cache.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto.js';

const TTL_MS = 30 * 1000;

export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * @param {object} o
 * @param {string} o.prefix  DB anahtar öneki, ör. 'slikair' -> 'slikair.merchantId'
 * @param {Array<{name:string,env:string,secret?:boolean,default?:string}>} o.fields
 */
export function createSecretSettingsStore({
  prefix,
  fields,
  load,
  save,
  env = process.env,
  encrypt = encryptSecret,
  decrypt = decryptSecret,
  now = Date.now,
  ttlMs = TTL_MS,
}) {
  const dbKey = name => `${prefix}.${name}`;
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));
  let cache = null;
  let loadedAt = 0;
  const listeners = [];

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      const raw = await load(fields.map(f => dbKey(f.name)));
      const out = {};
      for (const f of fields) {
        const v = raw[dbKey(f.name)];
        if (!v) continue;
        if (f.secret) {
          try { out[f.name] = decrypt(v); } catch { /* çözülemedi: env'e düş */ }
        } else {
          out[f.name] = v;
        }
      }
      cache = out;
    } catch {
      cache = {};
    }
    loadedAt = now();
    return cache;
  }

  function invalidate() {
    cache = null;
    loadedAt = 0;
    for (const fn of listeners) fn();
  }

  function resolve(f, db) {
    if (db[f.name]) return { value: db[f.name], source: 'db' };
    if (env[f.env]) return { value: env[f.env], source: 'env' };
    if (f.default != null) return { value: f.default, source: 'default' };
    return { value: '', source: 'unset' };
  }

  return {
    /** Etkin değerlerin düz haritası (sunucu içi kullanım; asla panele verilmez). */
    async getAll() {
      const db = await snapshot();
      return Object.fromEntries(fields.map(f => [f.name, resolve(f, db).value]));
    },

    /** Panel görünümü: gizli alanlar maskeli, kaynak bilgisiyle. */
    async getAdminView() {
      const db = await snapshot();
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
    async update(patch = {}, { clear = [], adminId } = {}) {
      for (const name of Object.keys(patch)) {
        if (!byName[name]) throw new Error(`Bilinmeyen ayar: ${name}`);
      }
      for (const name of clear) {
        if (!byName[name]) throw new Error(`Bilinmeyen ayar: ${name}`);
      }
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
      for (const [key, value] of ops) await save(key, value, adminId);
      invalidate();
    },

    onChange(fn) { listeners.push(fn); },
    invalidate,
  };
}

export const mongoLoad = async keys => {
  if (mongoose.connection.readyState !== 1) return {};
  const rows = await Setting.find({ key: { $in: keys } }).lean();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
};

export const mongoSave = async (key, value, adminId) => {
  if (value == null) {
    await Setting.deleteOne({ key });
    return;
  }
  await Setting.updateOne({ key }, { $set: { value, updatedBy: adminId } }, { upsert: true });
};
