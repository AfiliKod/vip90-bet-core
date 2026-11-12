import { Router } from 'express';
import { requireStaff } from '../middleware/auth.js';
import * as controller from '../controllers/staffAuth.js';
import { emailFlowLimiter } from '../middleware/rateLimit.js';
import { acceptStaffInvite } from '../platform/services/staffInvite.js';

const router = Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.get('/me', requireStaff(), controller.me);
router.post('/logout', controller.logout);
// One-time invitation (tenant owner, staff): sets the password; 2FA at login.
const inviteLimiter = process.env.NODE_ENV === 'test' ? (req, res, next) => next() : emailFlowLimiter;
router.post('/accept-invite', inviteLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    const result = await acceptStaffInvite({ token, password });
    res.json({ ok: true, email: result.email });
  } catch (error) {
    next(error);
  }
});

export default router;
