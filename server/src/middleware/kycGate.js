import User from '../models/User.js';
import { createError } from './error.js';
import { getModuleUsability } from '../services/licensing/index.js';
import { kycConfig } from '../config/kyc.js';

/**
 * Para ÇEKME başlatmadan önce onaylı KYC şartı.
 *
 * Kapı şu durumlarda uygulanır ya da uygulanmaz (2026-10-12, operatör
 * politikası açıkça tanımlandı):
 *
 *   modül kapalı (operatör seçimi)              → kapı yok
 *   modül açık + "KYC aktif" anahtarı kapalı     → kapı yok (oyuncu başvuru
 *                                                  yapamıyorken çekimi
 *                                                  kilitlemek anlamsız)
 *   modül açık + lisanslı + KYC aktif           → onaylı KYC şart, yoksa
 *                                                  403 KYC_REQUIRED
 *   modül/lisans durumu okunamadı ya da
 *   modül açık ama lisansı geçersiz             → KYC_FAILURE_POLICY:
 *       'block' (varsayılan) → 503 KYC_CHECK_UNAVAILABLE, çekim durur
 *       'allow'              → çekim KYC'siz geçer, uyarı log'lanır
 *
 * Önceden bu son durumda kapı sessizce açılıyordu (lisans kesintisi ya da
 * okunamayan ayar, KYC'siz çekime izin veriyordu). Kullanıcı kaydı
 * okunamazsa hata yukarı gider (500; çekim zaten yapılamaz).
 * Yatırma ve oyun bu kapıdan geçmez.
 */
export function requireKycForWithdrawal({
  getUsability = getModuleUsability,
  getConfig = (key) => kycConfig.get(key),
  findUser = (id) => User.findById(id).select('kycStatus kycVerified').lean(),
  log = (msg) => console.warn(msg),
} = {}) {
  return async function kycGate(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) return next();

      const usability = await getUsability('kyc-verification').catch(() => 'unknown');
      if (usability === 'disabled') return next();

      if (usability !== 'usable') {
        const policy = (await getConfig('KYC_FAILURE_POLICY').catch(() => null)) === 'allow' ? 'allow' : 'block';
        if (policy === 'allow') {
          log(`[kycGate] KYC durumu denetlenemedi (${usability}); KYC_FAILURE_POLICY=allow → çekim KYC'siz geçti, userId=${userId}`);
          return next();
        }
        return next(createError(
          503,
          'KYC_CHECK_UNAVAILABLE',
          'Kimlik doğrulama durumu şu an denetlenemiyor; çekimler geçici olarak durduruldu',
          { reason: usability },
        ));
      }

      // "KYC aktif" kapalıysa oyuncu başvuru yapamaz; çekimi de kilitleme.
      if ((await getConfig('KYC_ENABLED').catch(() => 'true')) === 'false') return next();

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
