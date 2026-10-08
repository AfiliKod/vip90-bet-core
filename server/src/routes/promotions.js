import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { claimPromotionSchema } from '../validators/promotions.js';
import * as ctrl from '../controllers/promotions.js';
import { getReferralSettings } from '../services/referralSettings.js';
const r = Router();
r.get('/', ctrl.list);
r.get('/referral-settings', async (_req, res, next) => {
  try {
    const { enabled, commissionRate } = await getReferralSettings();
    res.json({ enabled, commissionRate });
  } catch (e) { next(e); }
});
r.get('/my-wagerings', requireAuth, ctrl.myWagerings);
r.post('/:id/claim', requireAuth, validate(claimPromotionSchema), ctrl.claim);
r.post('/:id/wagerings/:wid/convert', requireAuth, ctrl.convert);
export default r;