import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getVipStatus } from '../services/vip.js';
import Transaction from '../models/Transaction.js';

const router = Router();
router.use(requireAuth);

// GET /api/vip/status — O1: kullanıcının güncel VIP seviyesi/ilerlemesi
router.get('/status', async (req, res, next) => {
  try {
    const status = await getVipStatus(req.user.id);
    res.json(status);
  } catch (e) { next(e); }
});

// GET /api/vip/cashback — kullanıcının cashback geçmişi
router.get('/cashback', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const [txns, total] = await Promise.all([
      Transaction.find({ userId: req.user.id, type: 'cashback' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments({ userId: req.user.id, type: 'cashback' }),
    ]);

    res.json({ transactions: txns, total, page, limit });
  } catch (e) { next(e); }
});

export default router;
