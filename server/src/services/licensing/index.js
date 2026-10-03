/**
 * Lisans servisinin üretim bağlantısı (M2).
 *
 * LICENSE_SERVER_URL + LICENSE_KEY tanımlıysa merkez lisans sunucusundan
 * durum çekilir ({ "<modülId>": { valid, expiresAt } } biçiminde JSON).
 *
 * Tanımlı DEĞİLSE ürün "yönetimsiz" modda çalışır: tüm tanımlı modüller
 * geçerli sayılır. Gerekçe: pazarda satılan ürün kutudan çıktığı gibi
 * çalışmalıdır; merkezi zorunluluk yalnızca operatör bir lisans sunucusuna
 * bağlanmak isterse devreye girer. Bu karar çekirdekte değil buradadır —
 * çekirdek yalnızca kendisine verilen durum haritasını değerlendirir.
 */
import mongoose from 'mongoose';
import { createLicenseStore } from './registry.js';
import { MODULE_DEFINITIONS } from '../../modules/registry.js';

const TIMEOUT_MS = 5_000;

async function fetchFromServer() {
  const base = process.env.LICENSE_SERVER_URL;
  const key = process.env.LICENSE_KEY;
  if (!base || !key) {
    // Yönetimsiz mod: merkez yok, tanımlı modüller yerinde geçerli.
    return Object.fromEntries(
      MODULE_DEFINITIONS.map(m => [m.id, { valid: true, expiresAt: null }]),
    );
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/license?key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`lisans sunucusu ${res.status} döndü`);
  const data = await res.json();
  if (!data || typeof data !== 'object' || typeof data.modules !== 'object') {
    throw new Error('lisans sunucusu yanıtı beklenen biçimde değil');
  }
  return data.modules;
}

const LICENSE_EXEMPT = new Set(MODULE_DEFINITIONS.filter(m => m.licenseExempt).map(m => m.id));

const baseLicenseStore = createLicenseStore({
  fetchLicenseState: fetchFromServer,
  moduleIds: MODULE_DEFINITIONS.map(m => m.id),
});

// Lisanstan muaf modüller (bkz. MODULE_DEFINITIONS.licenseExempt) her zaman
// lisanslı sayılır; yalnız admin aç/kapa anahtarı belirleyicidir.
export const licenseStore = {
  ...baseLicenseStore,
  async isLicensed(id) {
    if (LICENSE_EXEMPT.has(id)) return true;
    return baseLicenseStore.isLicensed(id);
  },
  async list() {
    const rows = await baseLicenseStore.list();
    return rows.map(r => (LICENSE_EXEMPT.has(r.id) ? { ...r, licensed: true, source: 'live', expiresAt: null } : r));
  },
};

export const isModuleLicensed = id => licenseStore.isLicensed(id);
export const listLicenses = () => licenseStore.list();
export const invalidateLicenses = () => licenseStore.invalidate();

/** Bir modülün gerçekten kullanılabilir olması için iki kapı da açık olmalı:
 *  admin anahtarı (modules) VE lisans (licensing). DB yoksa modules zaten
 *  fail-closed olduğundan sorguya girmeye gerek yok. */
export async function isModuleUsable(id) {
  if (mongoose.connection.readyState !== 1) return false;
  const { moduleStore } = await import('../../modules/index.js');
  return (await moduleStore.isEnabled(id)) && (await licenseStore.isLicensed(id));
}
