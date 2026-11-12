import Event from '../models/Event.js';
import { runAsPlatform } from '../tenancy/context.js';
import { PLATFORM_JOB_REASONS } from '../tenancy/tenantKeys.js';

export async function runCleanupOnce({
  platform = runAsPlatform,
  updateMany = (filter, update) => Event.updateMany(filter, update),
  deleteMany = (filter) => Event.deleteMany(filter),
  onPlatform = () => {},
} = {}) {
  return platform(PLATFORM_JOB_REASONS.EVENT_CLEANUP, async () => {
    onPlatform();
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
    const archive = await updateMany(
      { status: 'finished', archivedAt: null, startTime: { $lte: new Date() } },
      { $set: { archivedAt: new Date() } },
    );

    // 24 saat+ önce başlamış hâlâ upcoming olan eventleri bitir
    const stale = await updateMany(
      { status: 'upcoming', startTime: { $lt: cutoff24h } },
      { $set: { status: 'finished' } },
    );

    // 30 günden uzak upcoming eventleri bitir (upcomingSync penceresi dışı)
    const farFuture = await updateMany(
      { status: 'upcoming', startTime: { $gt: horizon30d } },
      { $set: { status: 'finished' } },
    );

    // İptal edilmiş eski etkinlikleri sil
    const deleted = await deleteMany({ status: 'cancelled', startTime: { $lt: cutoff24h } });

    return {
      archived: archive.modifiedCount,
      stale: stale.modifiedCount,
      farFuture: farFuture.modifiedCount,
      deleted: deleted.deletedCount,
    };
  });
}

export function startCleanupJob() {
  const INTERVAL = 60 * 60 * 1000; // 1 hour

  async function run() {
    const { archived, stale, farFuture, deleted } = await runCleanupOnce();
    if (archived > 0) console.log(`[cleanup] ${archived} events archived`);
    if (stale > 0) console.log(`[cleanup] ${stale} stale upcoming events marked finished`);
    if (farFuture > 0) console.log(`[cleanup] ${farFuture} far-future events marked finished`);
    if (deleted > 0) console.log(`[cleanup] ${deleted} cancelled events deleted`);
  }

  run(); // run immediately on start
  setInterval(run, INTERVAL);
}
