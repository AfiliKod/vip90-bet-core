import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getVipStatus } from '../services/vip.js';

const router = Router();
router.use(requireAuth);

// GET /api/vip/status — O1: kullanıcının güncel VIP seviyesi/ilerlemesi
router.get('/status', async (req, res, next) => {
  try {
    const status = await getVipStatus(req.user.id);
    res.json(status);
  } catch (e) { next(e); }
});

export default router;
