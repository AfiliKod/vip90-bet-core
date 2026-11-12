import { expireOldKyc } from '../services/kyc.js';
import { forEachTenant } from '../tenancy/forEachTenant.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runKycExpiryJobOnce({ run = expireOldKyc } = {}) {
  return forEachTenant(async () => run());
}

// 1 yılı dolan onaylı KYC'leri 'expired' yapar. Günde bir (ve açılışta bir kez).
export function startKycExpiryJob() {
  async function run() {
    try {
      const results = await runKycExpiryJobOnce();
      const n = results.reduce((sum, r) => sum + (r.result || 0), 0);
      if (n > 0) console.log(`[kycExpiry] ${n} KYC süresi doldu`);
    } catch (e) {
      console.error('[kycExpiry] error:', e.message);
    }
  }
  run();
  setInterval(run, DAY_MS);
}
