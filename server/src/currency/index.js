/**
 * Para birimi sisteminin üretim bağlantısı (U4).
 *
 * DB anahtarı: `currency.code` — mevcut Setting koleksiyonunu kullanır
 * (theme/index.js, modules/index.js ile aynı yaklaşım).
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createCurrencyStore, CURRENCY_DEFINITIONS, formatMoney as formatMoneyPure } from './registry.js';

const KEY = 'currency.code';

export const currencyStore = createCurrencyStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return {};
    const row = await Setting.findOne({ key: KEY }).lean();
    return row ? { code: row.value } : {};
  },
});

export const getActiveCurrency = () => currencyStore.getActive();
export const listCurrencies = () => currencyStore.list();
export const invalidateCurrency = () => currencyStore.invalidate();

/** Aktif para birimiyle bir tutarı biçimlendirir — hata/log mesajları için. */
export async function formatMoney(amount) {
  const active = await getActiveCurrency();
  return formatMoneyPure(amount, active);
}

/** Admin panelinden aktif para birimini değiştirir. */
export async function setActiveCurrency(code, updatedBy) {
  if (!CURRENCY_DEFINITIONS.some(c => c.code === code)) {
    throw new Error(`Bilinmeyen para birimi: ${code}`);
  }
  await Setting.updateOne(
    { key: KEY },
    { $set: { value: code, updatedBy } },
    { upsert: true },
  );
  invalidateCurrency();
}
