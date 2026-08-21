/**
 * U5 — Saat dilimi deposunun üretim bağlantısı (Setting koleksiyonu).
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createTimezoneStore } from './timezone.js';

export const timezoneStore = createTimezoneStore({
  loadSetting: async (key) => {
    if (mongoose.connection.readyState !== 1) return null;
    const row = await Setting.findOne({ key }).lean();
    return row?.value ?? null;
  },
  saveSetting: async (key, value, updatedBy) => {
    await Setting.updateOne({ key }, { $set: { value, updatedBy } }, { upsert: true });
  },
});
