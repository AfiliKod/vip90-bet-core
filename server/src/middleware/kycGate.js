import User from '../models/User.js';
import { createError } from './error.js';
import { isModuleUsable } from '../services/licensing/index.js';

/**
 * Para ÇEKME başlatmadan önce onaylı KYC şartı.
 *
 * `kyc-verification` modülü kullanılabilir (açık + lisans) iken onaylı KYC'si
 * olmayan oyuncu çekim başlatamaz: 403 KYC_REQUIRED. Modül kapalıyken
 * davranış değişmez. Yatırma ve oyun bu kapıdan geçmez.
 * Modül durumu ölçülemezse kapalı sayılır (mevcut davranışı bozma).
 */
export function requireKycForWithdrawal({
  isUsable = isModuleUsable,
  findUser = (id) => User.findById(id).select('kycStatus kycVerified').lean(),
} = {}) {
  return async function kycGate(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) return next();

      let enabled = false;
      try { enabled = await isUsable('kyc-verification'); } catch { enabled = false; }
      if (!enabled) return next();

      const user = await findUser(userId);
      if (user?.kycVerified && user?.kycStatus === 'approved') return next();

      return next(createError(
        403,
        'KYC_REQUIRED',
        'Para çekmek için kimlik doğrulaması (KYC) gerekiyor',
        { kycStatus: user?.kycStatus || 'not_started' },
      ));
    } catch (err) {
      next(err);
    }
  };
}
