/**
 * Öne çıkan oyunlar listesinin üretim bağlantısı (A5).
 *
 * DB anahtarı: `games.featured` — mevcut Setting koleksiyonunda tek bir JSON
 * dizi, theme/index.js ve pages/index.js'teki aynı yaklaşım (Setting
 * yeniden kullanımı).
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createFeaturedGamesStore } from './registry.js';

const KEY = 'games.featured';

export const featuredGamesStore = createFeaturedGamesStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return null;
    const row = await Setting.findOne({ key: KEY }).lean();
    return row?.value ?? null;
  },
});

export const getFeaturedGameCodes = () => featuredGamesStore.get();
export const invalidateFeaturedGames = () => featuredGamesStore.invalidate();

/** Admin panelinden öne çıkan oyun listesini (kodlar, sırayla) değiştirir. */
export async function setFeaturedGameCodes(codes, updatedBy) {
  await Setting.updateOne(
    { key: KEY },
    { $set: { value: JSON.stringify(codes), updatedBy } },
    { upsert: true },
  );
  invalidateFeaturedGames();
}
