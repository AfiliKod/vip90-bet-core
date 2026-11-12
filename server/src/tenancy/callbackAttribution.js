import { runAsPlatform } from './context.js';
import SlikairPayment from '../models/SlikairPayment.js';
import SlikairPayout from '../models/SlikairPayout.js';

export async function findPaymentForCallback(payinId) {
  if (!payinId) return null;
  return runAsPlatform('slikair_webhook_attribution', async () => {
    return SlikairPayment.findOne({ payinId }).lean();
  });
}

export async function findPayoutForCallback({ payoutId, merchantReference }) {
  if (!payoutId && !merchantReference) return null;
  return runAsPlatform('slikair_payout_attribution', async () => {
    const filter = payoutId ? { payoutId } : { merchantReference };
    return SlikairPayout.findOne(filter).lean();
  });
}