import Event from '../models/Event.js';

export function startCleanupJob() {
  const INTERVAL = 60 * 60 * 1000; // 1 hour

  async function run() {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const horizon30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Finished eventleri arşivle — startTime hâlâ gelecekteyse ASLA arşivleme.
    // "finished" + gelecekteki startTime mantıksal olarak imkânsız bir durum;
    // bunun tek gerçekçi sebebi oddsSourceUpcomingSync.js'in reconciliation
    // adımının provider'dan gelen kısmi/hatalı bir feed'i "event artık yok"
    // sanmasıdır (2026-09-10'da aynı gün İKİ kez gerçek veri kaybına yol açtı
    // — bkz. todo.md "E"). cleanup her server başlangıcında ANINDA çalıştığı
    // için (`run()` en altta) böyle bir yanlış işaretleme saniyeler içinde
    // kalıcı arşive dönüşüyordu. Bu, o zincirin son (savunma-derinliği) halkası.
    const archiveResult = await Event.updateMany(
      { status: 'finished', archivedAt: null, startTime: { $lte: new Date() } },
      { $set: { archivedAt: new Date() } },
    );
    if (archiveResult.modifiedCount > 0) {
      console.log(`[cleanup] ${archiveResult.modifiedCount} events archived`);
    }

    // 24 saat+ önce başlamış hâlâ upcoming olan eventleri bitir
    const staleResult = await Event.updateMany(
      { status: 'upcoming', startTime: { $lt: cutoff24h } },
      { $set: { status: 'finished' } },
    );
    if (staleResult.modifiedCount > 0) {
      console.log(`[cleanup] ${staleResult.modifiedCount} stale upcoming events marked finished`);
    }

    // 30 günden uzak upcoming eventleri bitir (upcomingSync penceresi dışı)
    const farFutureResult = await Event.updateMany(
      { status: 'upcoming', startTime: { $gt: horizon30d } },
      { $set: { status: 'finished' } },
    );
    if (farFutureResult.modifiedCount > 0) {
      console.log(`[cleanup] ${farFutureResult.modifiedCount} far-future events marked finished`);
    }

    // İptal edilmiş eski etkinlikleri sil
    const result = await Event.deleteMany({
      status: 'cancelled',
      startTime: { $lt: cutoff24h },
    });
    if (result.deletedCount > 0) {
      console.log(`[cleanup] ${result.deletedCount} cancelled events deleted`);
    }
  }

  run(); // run immediately on start
  setInterval(run, INTERVAL);
}
