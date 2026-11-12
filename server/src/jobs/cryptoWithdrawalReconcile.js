import { reconcileProcessingWithdrawals } from '../services/cryptoWithdrawal.js';
import { forEachTenant } from '../tenancy/forEachTenant.js';

const INTERVAL_MS = 60 * 1000;

export async function runCryptoWithdrawalReconcileOnce({ run = reconcileProcessingWithdrawals } = {}) {
  return forEachTenant(async () => run());
}

// "processing" kripto çekimlerini dakikada bir zincirle uzlaştırır: başarılıysa
// tamamlar, gönderilmediği kesinleşirse iade eder / yeniden onaya açar.
// Bkz. services/cryptoWithdrawal.js. Çalışırken üst üste binmez.
export function startCryptoWithdrawalReconcileJob() {
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      const results = await runCryptoWithdrawalReconcileOnce();
      const summary = {};
      for (const { result } of results) {
        for (const [status, count] of Object.entries(result || {})) {
          summary[status] = (summary[status] || 0) + count;
        }
      }
      const settled = Object.entries(summary).filter(([s]) => !['waiting', 'not_processing'].includes(s));
      if (settled.length) console.log('[cryptoReconcile]', JSON.stringify(summary));
      if (summary.manual_review) console.warn(`[cryptoReconcile] ${summary.manual_review} çekim elle inceleme bekliyor`);
    } catch (e) {
      console.error('[cryptoReconcile] error:', e.message);
    } finally {
      running = false;
    }
  }
  run();
  setInterval(run, INTERVAL_MS).unref();
}
