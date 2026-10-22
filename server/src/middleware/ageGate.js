import User from '../models/User.js';
import { createError } from './error.js';

/**
 * 18+ kapısı — para oynatılan her yolda ZORUNLU.
 *
 * Durum (2026-10-08, bu dosyadan önce): `User.ageConfirmedAt` ve
 * `User.ageVerifiedAt` alanları şemada VARDI ama HİÇBİR YERE YAZILMIYORDU
 * (kayıt yalnız `acceptedTermsAt`/`acceptedKvkkAt` yazıyor, `ageConfirmedAt`
 * sadece `users.js` içinde okunuyordu) ve hiçbir middleware bunu denetlemiyordu
 * — yani 18+ onayı yalnız istemcide bir kutu idi. Sert kapı hiçbir onay kaydı
 * olmayan mevcut oyuncuların tamamını kilitlememeli; bu yüzden kapı **onay
 * kapısı** olarak kuruldu: eksik kayıtta 403 + `AGE_CONFIRMATION_REQUIRED`
 * döner, istemci tek tıkla onay ekranını gösterir ve `POST /auth/age-confirm`
 * kaydı yazar. Doğum tarihi 18 yaş üstünü kanıtlıyorsa `ageVerifiedAt` de yazılır.
 *
 * `dateOfBirth` 18 yaş altını kanıtlıyorsa onay reddedilir (422).
 *
 * @param {Function} findUser - test için DI: (id) => lean kullanıcı
 */
export function enforceAgeGate({ findUser = (id) => User.findById(id).select('ageConfirmedAt ageVerifiedAt dateOfBirth').lean() } = {}) {
  return async function ageGate(req, res, next) {
    try {
      // Oturumsuz uçlar (ör. provider'ın imzalı /callback'i) bu kapıdan geçmez.
      if (!req.user?.id) return next();

      let user;
      try {
        user = await findUser(req.user.id);
      } catch {
        // Kullanıcı okunamıyorsa kapıyı AÇIK bırak: erişilemeyen bir kayıt
        // için oyuncu kilitlemek, kapının varlık sebebini (koruma) ihlal eder.
        return next();
      }
      if (!user) return next();
      if (hasAgeConsent(user)) return next();

      return next(createError(
        403,
        'AGE_CONFIRMATION_REQUIRED',
        'Casino oyunlarına erişmek için 18 yaşından büyük olduğunu onaylamalısın',
        { ageConfirmedAt: user.ageConfirmedAt ?? null, ageVerifiedAt: user.ageVerifiedAt ?? null },
      ));
    } catch (err) {
      next(err);
    }
  };
}

/** Kayıtlı bir yaş onayı var mı? (beyan veya doğum tarihi doğrulaması) */
export function hasAgeConsent(user) {
  if (!user) return false;
  return Boolean(user.ageVerifiedAt || user.ageConfirmedAt);
}

/** 18 yaş sınırı (oyuncu saate göre). Doğum tarihi 18'den küçükse false. */
export function isAdultDateOfBirth(dob, now = new Date()) {
  if (!dob) return null;                      // bilinmiyor → beyan yeterli
  const birth = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const eighteen = new Date(birth);
  eighteen.setFullYear(eighteen.getFullYear() + 18);
  return eighteen <= now;
}