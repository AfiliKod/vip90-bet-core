import { expireOldKyc } from '../services/kyc.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// 1 yılı dolan onaylı KYC'leri 'expired' yapar. Günde bir (ve açılışta bir kez).
export function startKycExpiryJob() {
  async function run() {
    try {
      const n = await expireOldKyc();
      if (n > 0) console.log(`[kycExpiry] ${n} KYC süresi doldu`);
    } catch (e) {
      console.error('[kycExpiry] error:', e.message);
    }
  }
  run();
  setInterval(run, DAY_MS);
}
