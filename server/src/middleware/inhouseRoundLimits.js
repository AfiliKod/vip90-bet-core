/**
 * In-house round başına sorumlu oyuncu denetimi (2026-10-08).
 *
 * Durum: `enforceResponsibleGaming` yalnız LAUNCH ucunda (`/launch`, action
 * `play`) çalışıyordu. Yani bir oyuncu günlük kayıp limitini doldurduktan
 * SONRA da in-house oyunlarında bahis oynayabiliyordu — limit yalnız oturum
 * açılışında ölçülüyordu. Aggregator (Igames) yolu da `bet` kontrolünü
 * kullanmıyor, o yol submodule'da (bkz. rapor/gap register).
 *
 * Bu middleware /callback'in **debit** gövdesinde çalışır: her turda gerçek
 * bahis tutarıyla `checkPlayerEligibility(userId, 'bet', { amount })` çağrılır.
 *
 * Reddedişte `{ approved:false, reason }` döner (200 DEĞİL — engine
 * `callDebit`'i `approved !== true` durumunda reddedip `400 BET_REJECTED`
 * döndürür; retry yok, para zaten hareket etmemiştir → retry fırtınası yok).
 *
 * `settle`/`balance` gövdeleri ve kimlik doğrulanamayan istekler geçer:
 * kabul/ödemeye dokunulmaz, sadece yeni bahis engellenir.
 *
 * @param {Function} checkEligibility - DI: (userId, action, ctx) => ALLOW|RESTRICT|BLOCK
 * @param {Function} findUser       - DI: (externalPlayerId) => lean kullanıcı | null
 */
export function enforceInhouseRoundLimits({
  checkEligibility,
  findUser,
} = {}) {
  return async function inhouseRoundLimits(req, res, next) {
    try {
      // Yalnız debit gövdesi bir para hareketidir; diğerleri geçer.
      if (req.body?.type !== 'debit') return next();

      const externalPlayerId = req.body?.externalPlayerId;
      const amount = Number(req.body?.amount ?? 0);
      if (!externalPlayerId || !(amount > 0)) return next();

      let userId = externalPlayerId;
      if (typeof findUser === 'function') {
        const user = await findUser(externalPlayerId);
        // Kullanıcı çözülemiyorsa ENGELLEME — kimlik doğrulama zaten HMAC ile
        // yapıldı; bilinmeyen oyuncu için yeni bir hata yolu açmıyoruz.
        if (!user) return next();
        if (user._id) userId = String(user._id);
      }

      const eligibility = await checkEligibility(userId, 'bet', { amount });
      if (eligibility === 'ALLOW' || eligibility == null) return next();

      const reason = eligibility === 'BLOCK'
        ? 'ACCOUNT_RESTRICTED'
        : 'RESPONSIBLE_GAMING_LIMIT';

      req.app?.log?.warn?.(`[inhouse] debit reddedildi (${reason}): user=${userId} amount=${amount}`);
      return res.status(403).json({ approved: false, reason });
    } catch (err) {
      // Denetim HATASI üzerinden geçirme: hesaplanamayan limit = oynanmaz.
      // (Bir middleware arızasının oyuncuları sınırsız oynatmasına izin verme.)
      return next(err);
    }
  };
}

/** Sadece test/okunabilirlik için: hata üretmeyen sarmalayıcı. */
export const ageGateError = () => createError(403, 'AGE_CONFIRMATION_REQUIRED', 'age');