import Event from '../models/Event.js';

export async function list(req, res, next) {
  try {
    const { sport, status, page = 1, limit = 2000 } = req.query;
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
      .skip((+page - 1) * +limit);
    res.json({ events });
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
