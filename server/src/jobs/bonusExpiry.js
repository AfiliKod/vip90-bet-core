import { expireOverdueWagerings } from '../services/wagering.js';
import { forEachTenant } from '../tenancy/forEachTenant.js';

export async function runBonusExpiryJobOnce({ run = expireOverdueWagerings } = {}) {
  return forEachTenant(async () => run());
}

/**
 * Süresi dolan bonus çevrimlerini saatte bir işler.
 *
 * Süre dolumu ayrıca tembel olarak da işlenir (bir sonraki bahiste ve çekim
 * kapısının kilit hesabında), ama bir daha hiç oynamayan oyuncunun çevrimi
 * bu iş olmadan sonsuza dek `active` (kilitli) kalırdı. Bkz.
 * services/wagering.js → expireWagering.
 */
export function startBonusExpiryJob() {
  const INTERVAL = 60 * 60 * 1000; // 1 saat

  async function tick() {
    try {
      const results = await runBonusExpiryJobOnce();
      const processed = results.reduce((n, r) => n + (r.result?.processed || 0), 0);
      const deducted = results.reduce((n, r) => n + (r.result?.deducted || 0), 0);
      if (processed > 0) {
        console.log(`[bonusExpiry] ${processed} süresi dolmuş çevrim işlendi, ${deducted} geri alındı`);
      }
    } catch (e) {
      console.error('[bonusExpiry] hata:', e.message);
    }
  }

  tick();
  return setInterval(tick, INTERVAL);
}
