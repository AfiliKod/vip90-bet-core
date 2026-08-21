/**
 * Ana sayfa içerik modelinin üretim bağlantısı (A4).
 *
 * DB anahtarı: `page.home` — mevcut Setting koleksiyonunda tek bir JSON
 * gövde, theme/index.js ve branding/index.js'teki aynı yaklaşımın (Setting
 * yeniden kullanımı) yapılı içerik versiyonu.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createHomeContentStore } from './registry.js';

const KEY = 'page.home';

export const homeContentStore = createHomeContentStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return null;
    const row = await Setting.findOne({ key: KEY }).lean();
    return row?.value ?? null;
  },
});

export const getHomeContent = () => homeContentStore.get();
export const invalidateHomeContent = () => homeContentStore.invalidate();

/** Admin panelinden ana sayfa içeriğini (bölüm sırası + banner'lar) değiştirir. */
export async function setHomeContent(content, updatedBy) {
  await Setting.updateOne(
    { key: KEY },
    { $set: { value: JSON.stringify(content), updatedBy } },
    { upsert: true },
  );
  invalidateHomeContent();
}
