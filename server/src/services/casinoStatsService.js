import mongoose from 'mongoose';
import CasinoRound from '../models/CasinoRound.js';
import { cacheKey } from '../tenancy/tenantKeys.js';
import { getCurrentTenantId } from '../tenancy/context.js';

// Popülerlik verisi ağır aggregate sorgusu olduğu için kısa süreli cache'leniyor.
const POPULAR_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

/** Empties the whole map (tests and ops). */
export function _clearCasinoStatsCache() {
  cache.clear();
}

export async function getPopularGames(limit = 15, { tenantId = getCurrentTenantId() } = {}) {
  const key = cacheKey(`popular:${limit}`, tenantId);
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const match = { provider: 'igames', bet: { $gt: 0 }, createdAt: { $gte: cutoff } };
  if (tenantId) {
    // The match carries the tenant explicitly even when the plugin only logs.
    match.tenantId = tenantId instanceof mongoose.Types.ObjectId
      ? tenantId
      : new mongoose.Types.ObjectId(String(tenantId));
  }
  const rows = await CasinoRound.aggregate([
    { $match: match },
    { $group: { _id: '$gameId', playCount: { $sum: 1 } } },
    { $sort: { playCount: -1 } },
    { $limit: limit },
  ]);
  const data = rows.filter(r => r._id).map(r => ({ game_code: r._id, playCount: r.playCount }));
  cache.set(key, { data, expiresAt: Date.now() + POPULAR_CACHE_TTL_MS });
  return data;
}
