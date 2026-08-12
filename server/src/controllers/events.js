import Event from '../models/Event.js';
import { buildSummaryTree } from '../utils/summaryTree.js';
import escapeStringRegexp from 'escape-string-regexp';

// Liste görünümünde (MiniEventCard/HeroSlider) sadece bu market tipleri gösteriliyor —
// bir event'te ortalama ~40 market / ~190 odds var ama listede en fazla 3'ü render ediliyor.
// Detay sayfası (GET /events/:id) ve admin panel (?full=1) hâlâ markets'i tam döndürüyor.
const LIST_MARKET_TYPES = new Set(['maç_sonucu', 'alt_üst', 'handikap']);

// Özet aggregation'ı (summary) için upcoming filtresi. list kendi filtresini ayrıca
// kuruyor ama archivedAt: null ve gelecek penceresi (FUTURE_WINDOW) burayla aynı tutulur.
function baseUpcomingMatch(status) {
  const futureLimit = new Date(Date.now() + FUTURE_WINDOW_MS);
  const m = { status: String(status || 'upcoming'), archivedAt: null };
  if (m.status === 'upcoming') m.startTime = { $lte: futureLimit };
  return m;
}

// "Yaklaşanlar" görünümünde bugünden bu kadar uzağa kadar olan etkinlikler gösterilir —
// bahis yapılma ihtimali düşük, aylar sonrasına kadar uzanan etkinlikleri elemek için.
// full=1 (admin) istekleri bu sınırdan muaftır.
const FUTURE_WINDOW_DAYS = 14;
const FUTURE_WINDOW_MS = FUTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Kısa TTL cache — sık tekrarlanan aynı sport+status kombinasyonlarının DB'ye
// tekrar tekrar gitmesini önler (bkz. palaceCasinoService.js'teki aynı desen).
// Oranlar/skorlar zaten socket.io ile anlık güncellendiği için bu kısa
// pencere gerçek zamanlılığı gözle görülür şekilde bozmaz.
const LIST_CACHE_TTL_MS = 5 * 1000;
const listCache = new Map();

function getCachedList(key) {
  const entry = listCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) listCache.delete(key);
  return null;
}

function setCachedList(key, data) {
  listCache.set(key, { data, expiresAt: Date.now() + LIST_CACHE_TTL_MS });
}

// Sadece testler için — cache'i temizler.
export function _clearListCacheForTests() {
  listCache.clear();
}

function trimMarketsForList(markets) {
  if (!Array.isArray(markets) || markets.length === 0) return [];
  const kept = [];
  const seen = new Set();
  for (const m of markets) {
    if (LIST_MARKET_TYPES.has(m.type) && !seen.has(m.type)) {
      kept.push(m);
      seen.add(m.type);
    }
  }
  // markets[0] her zaman korunur — client'taki "maç_sonucu yoksa markets[0]'a düş" fallback'i bozulmasın diye
  if (!seen.has(markets[0].type)) kept.unshift(markets[0]);
  return kept;
}

export async function list(req, res, next) {
  try {
    const { sport, status, page = 1, limit = 2000, full, country, league, search } = req.query;
    const isFull = full === '1' || full === 'true';
    const futureLimit = new Date(Date.now() + FUTURE_WINDOW_MS);

    const cacheable = !isFull && +page === 1 && !search;
    const cacheKey = cacheable
      ? `${sport || 'all'}|${status || ''}|${limit}|${country || ''}|${league || ''}|${search || ''}`
      : null;
    if (cacheable) {
      const cached = getCachedList(cacheKey);
      if (cached) return res.json(cached);
    }

    const filter = {};
    if (sport && sport !== 'all') filter.sport = String(sport);
    if (country != null) filter.country = String(country);
    if (league) filter.league = String(league);
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeStringRegexp(String(search).trim()), 'i');
      filter.$or = [
        { 'homeTeam.name': rx },
        { 'awayTeam.name': rx },
        { league: rx },
      ];
    }

    if (status) {
      filter.status = String(status);
      // Arşivlenmiş etkinlikler hem live hem upcoming isteklerinden hariç — summary
      // (baseUpcomingMatch) ve else dalıyla tutarlı olsun diye.
      filter.archivedAt = null;
      // "Yaklaşanlar" (status=upcoming) açık isteğinde de gelecek penceresi
      // sınırı uygulanır — full=1 (admin) hariç. Önceden bu yolda HİÇ sınır
      // yoktu (DB'deki tüm upcoming kayıtları dönebiliyordu).
      if (!isFull && String(status) === 'upcoming') {
        filter.startTime = { $lte: futureLimit };
      }
    } else {
      // Canlı etkinlikler her zaman + yaklaşanlar (son 3 saat ile FUTURE_WINDOW_DAYS gün arası)
      const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const liveUpcoming = [
        { status: 'live' },
        { status: 'upcoming', startTime: { $gt: cutoff, ...(isFull ? {} : { $lte: futureLimit }) } },
      ];
      // search zaten filter.$or set etmiş olabilir — onu ezme, $and ile birleştir.
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: liveUpcoming }];
        delete filter.$or;
      } else {
        filter.$or = liveUpcoming;
      }
      filter.archivedAt = null;
    }

    const events = await Event.find(filter)
      .sort({ startTime: 1 })
      .limit(+limit)
      .skip((+page - 1) * +limit)
      .lean();

    if (isFull) {
      return res.json({ events });
    }

    const trimmed = events.map(ev => ({
      ...ev,
      marketsCount: ev.markets?.length ?? 0,
      markets: trimMarketsForList(ev.markets),
    }));
    const responseBody = { events: trimmed };
    if (cacheable) setCachedList(cacheKey, responseBody);
    res.json(responseBody);
  } catch (e) {
    next(e);
  }
}

export async function getById(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Etkinlik bulunamadı' }
      });
    }
    res.json({ event });
  } catch (e) {
    next(e);
  }
}

export async function summary(req, res, next) {
  try {
    const status = req.query.status || 'upcoming';
    const cacheKey = `summary|${status}`;
    const cached = getCachedList(cacheKey);
    if (cached) return res.json(cached);

    const rows = await Event.aggregate([
      { $match: baseUpcomingMatch(status) },
      { $group: { _id: { sport: '$sport', country: '$country', league: '$league' }, count: { $sum: 1 } } },
    ]);
    const flat = rows.map(r => ({
      sport: r._id.sport, country: r._id.country || '', league: r._id.league, count: r.count,
    }));
    const tree = buildSummaryTree(flat);
    setCachedList(cacheKey, tree);
    res.json(tree);
  } catch (e) { next(e); }
}
