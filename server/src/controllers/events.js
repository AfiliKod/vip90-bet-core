import Event from '../models/Event.js';

// Liste görünümünde (MiniEventCard/HeroSlider) sadece bu market tipleri gösteriliyor —
// bir event'te ortalama ~40 market / ~190 odds var ama listede en fazla 3'ü render ediliyor.
// Detay sayfası (GET /events/:id) ve admin panel (?full=1) hâlâ markets'i tam döndürüyor.
const LIST_MARKET_TYPES = new Set(['maç_sonucu', 'alt_üst', 'handikap']);

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
    const { sport, status, page = 1, limit = 2000, full } = req.query;
    const filter = {};
    if (sport && sport !== 'all') filter.sport = String(sport);
    if (status) {
      filter.status = String(status);
    } else {
      // Canlı etkinlikler her zaman + yaklaşanlar (son 3 saat veya gelecekte)
      const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
      filter.$or = [
        { status: 'live' },
        { status: 'upcoming', startTime: { $gt: cutoff } },
      ];
      filter.archivedAt = null;
    }
    const events = await Event.find(filter)
      .sort({ startTime: 1 })
      .limit(+limit)
      .skip((+page - 1) * +limit)
      .lean();

    if (full === '1' || full === 'true') {
      return res.json({ events });
    }

    const trimmed = events.map(ev => ({
      ...ev,
      marketsCount: ev.markets?.length ?? 0,
      markets: trimMarketsForList(ev.markets),
    }));
    res.json({ events: trimmed });
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
