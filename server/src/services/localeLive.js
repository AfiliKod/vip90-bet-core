/**
 * Varsayılan dil deposunun üretim bağlantısı (Setting koleksiyonu) —
 * timezoneLive.js ile birebir aynı desen.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createLocaleStore } from './locale.js';

export const localeStore = createLocaleStore({
  loadSetting: async (key) => {
    if (mongoose.connection.readyState !== 1) return null;
    const row = await Setting.findOne({ key }).lean();
    return row?.value ?? null;
  },
  saveSetting: async (key, value, updatedBy) => {
    await Setting.updateOne({ key }, { $set: { value, updatedBy } }, { upsert: true });
  },
});
