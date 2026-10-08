import { expireOverdueWagerings } from '../services/wagering.js';

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

  async function run() {
    try {
      const { processed, deducted } = await expireOverdueWagerings();
      if (processed > 0) {
        console.log(`[bonusExpiry] ${processed} süresi dolmuş çevrim işlendi, ${deducted} geri alındı`);
      }
    } catch (e) {
      console.error('[bonusExpiry] hata:', e.message);
    }
  }

  run();
  return setInterval(run, INTERVAL);
}
