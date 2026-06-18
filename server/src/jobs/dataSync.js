/* ============================================================
   DataSync Job — Odds API'dan etkinlik ve oran senkronizasyonu
   ============================================================ */

import Event from '../models/Event.js';
import { fetchAllEvents, fetchOddsForSport, buildMarkets, SPORTS_TO_SYNC } from '../services/oddsApi.js';

/* Harici ID'ye göre upsert — var olanı güncelle, yoksa oluştur */
async function upsertEvent(data) {
  const existing = await Event.findOne({ externalId: data.externalId });
  if (existing) {
    // Sadece bekleyen/upcoming etkinliklerin oranlarını güncelle
    if (existing.status === 'upcoming' || existing.status === 'live') {
      existing.markets = data.markets;
      existing.startTime = data.startTime;
      await existing.save();
    }
    return { action: 'updated' };
  }
  await Event.create(data);
  return { action: 'created' };
}

/* İlk tam senkronizasyon */
export async function fullSync() {
  if (!process.env.ODDS_API_KEY) {
    console.warn('ODDS_API_KEY tanımlanmamış, senkronizasyon atlandı');
    return;
  }

  console.log('📡 Odds API tam senkronizasyonu başlıyor...');
  let events;
  try {
    events = await fetchAllEvents();
  } catch (err) {
    if (err.quotaExceeded) { console.warn('⚠️  Odds API kotası doldu — senkronizasyon atlandı'); return; }
    throw err;
  }

  let created = 0, updated = 0;
  for (const event of events) {
    const { action } = await upsertEvent(event);
    if (action === 'created') created++;
    else updated++;
  }

  console.log(`✅ Senkronizasyon tamamlandı: ${created} yeni, ${updated} güncellendi`);
}

/* Periyodik oran güncellemesi (her 10 dakikada bir) */
export function startOddsSync(io) {
  if (!process.env.ODDS_API_KEY) return;

  const INTERVAL_MS = 10 * 60 * 1000; // 10 dakika

  setInterval(async () => {
    console.log('🔄 Oran güncellemesi başlıyor...');
    let updated = 0;

    for (const sport of SPORTS_TO_SYNC) {
      try {
        const events = await fetchOddsForSport(sport.key);

        for (const e of events) {
          if (!e.bookmakers?.length) continue;
          const existing = await Event.findOne({ externalId: e.id, status: { $in: ['upcoming', 'live'] } });
          if (!existing) continue;

          const newMarkets = buildMarkets(e.bookmakers);
          if (!newMarkets.length) continue;

          existing.markets = newMarkets;
          existing.markModified('markets');
          await existing.save();

          // Socket.IO ile client'a anlık bildir
          io.emit('odds:update', { eventId: existing._id, markets: existing.markets });
          updated++;
        }
      } catch (err) {
        if (err.quotaExceeded) { console.warn('⚠️  Odds API kotası doldu — periyodik güncelleme durduruluyor'); return; }
        console.error(`Oran güncelleme hatası (${sport.key}):`, err.message);
      }
    }

    console.log(`✅ ${updated} etkinliğin oranları güncellendi`);
  }, INTERVAL_MS);
}
