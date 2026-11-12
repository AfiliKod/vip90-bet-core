import { runAsPlatform } from './context.js';
import SlikairPayment from '../models/SlikairPayment.js';
import SlikairPayout from '../models/SlikairPayout.js';

/**
 * The stored Slikair payment a payin webhook names, read platform-wide because
 * the webhook itself carries no tenant. Its `tenantId` is the attribution.
 * @param {string} payinId
 * @returns {Promise<object|null>} lean payment document or null
 */
export async function findPaymentForCallback(payinId) {
  if (!payinId) return null;
  return runAsPlatform('slikair_webhook_attribution', async () => {
    return SlikairPayment.findOne({ payinId }).lean();
  });
}

/**
 * The stored Slikair payout a payout webhook names (by payout id, else by
 * merchant reference), read platform-wide for the same reason.
 * @param {{ payoutId?: string, merchantReference?: string }} ref
 * @returns {Promise<object|null>} lean payout document or null
 */
export async function findPayoutForCallback({ payoutId, merchantReference }) {
  if (!payoutId && !merchantReference) return null;
  return runAsPlatform('slikair_payout_attribution', async () => {
    const filter = payoutId ? { payoutId } : { merchantReference };
    return SlikairPayout.findOne(filter).lean();
  });
}
