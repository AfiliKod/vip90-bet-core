import CasinoRound from '../models/CasinoRound.js';

// Popülerlik verisi ağır aggregate sorgusu olduğu için kısa süreli cache'leniyor.
const POPULAR_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export async function getPopularGames(limit = 15) {
  const key = `popular:${limit}`;
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await CasinoRound.aggregate([
    { $match: { provider: 'igames', bet: { $gt: 0 }, createdAt: { $gte: cutoff } } },
    { $group: { _id: '$gameId', playCount: { $sum: 1 } } },
    { $sort: { playCount: -1 } },
    { $limit: limit },
  ]);
  const data = rows.filter(r => r._id).map(r => ({ game_code: r._id, playCount: r.playCount }));
  cache.set(key, { data, expiresAt: Date.now() + POPULAR_CACHE_TTL_MS });
  return data;
}
