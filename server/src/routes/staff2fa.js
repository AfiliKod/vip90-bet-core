import { Router } from 'express';
import { challengeVerify, confirm2fa, setup2fa } from '../controllers/staff2fa.js';

const router = Router();

// Staff authentication middleware is mounted by the staff API integration.
// These handlers additionally require req.staff before any account mutation.
router.post('/setup', setup2fa);
router.post('/confirm', confirm2fa);
router.post('/challenge-verify', challengeVerify);

export default router;
