import Event from '../models/Event.js';

export function startCleanupJob() {
  const INTERVAL = 60 * 60 * 1000; // 1 hour

  async function run() {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const horizon30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Finished eventleri arşivle
    const archiveResult = await Event.updateMany(
      { status: 'finished', archivedAt: null },
      { $set: { archivedAt: new Date() } },
    );
    if (archiveResult.modifiedCount > 0) {
      console.log(`[cleanup] ${archiveResult.modifiedCount} etkinlik arşivlendi`);
    }

    // 24 saat+ önce başlamış hâlâ upcoming olan eventleri bitir
    const staleResult = await Event.updateMany(
      { status: 'upcoming', startTime: { $lt: cutoff24h } },
      { $set: { status: 'finished' } },
    );
    if (staleResult.modifiedCount > 0) {
      console.log(`[cleanup] ${staleResult.modifiedCount} eski upcoming etkinlik finished yapıldı`);
    }

    // 30 günden uzak upcoming eventleri bitir (upcomingSync penceresi dışı)
    const farFutureResult = await Event.updateMany(
      { status: 'upcoming', startTime: { $gt: horizon30d } },
      { $set: { status: 'finished' } },
    );
    if (farFutureResult.modifiedCount > 0) {
      console.log(`[cleanup] ${farFutureResult.modifiedCount} uzak gelecek etkinlik finished yapıldı`);
    }

    // İptal edilmiş eski etkinlikleri sil
    const result = await Event.deleteMany({
      status: 'cancelled',
      startTime: { $lt: cutoff24h },
    });
    if (result.deletedCount > 0) {
      console.log(`[cleanup] ${result.deletedCount} iptal etkinlik silindi`);
    }
  }

  run(); // run immediately on start
  setInterval(run, INTERVAL);
}
