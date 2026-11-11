import CasinoSession from '../models/CasinoSession.js';
import { createError } from '../middleware/error.js';

/**
 * V19b: no platform withdrawal while an igames session is open (`active` or
 * `closing`). The player's casino money is at the provider until the close
 * credits it (F3); for a legacy session the close sets
 * balance = max(balance, withdrawn), so a withdrawal of in-session callback
 * wins would be paid again by that max. CasinoSession lives in bet, so this
 * works with or without the igames module.
 */
export async function assertNoOpenIgamesSession(userId) {
  const open = await CasinoSession.findOne({ userId, status: { $in: ['active', 'closing'] } })
    .select('needsReconciliation').lean();
  if (!open) return;
  if (open.needsReconciliation) {
    throw createError(409, 'IGAMES_SESSION_REVIEW', 'Casino oturumunuz destek ekibi tarafından inceleniyor. İnceleme bitince çekim yapabilirsiniz.');
  }
  throw createError(409, 'IGAMES_SESSION_OPEN', 'Açık bir casino oturumunuz var. Çekim için önce oyunu kapatın.');
}
