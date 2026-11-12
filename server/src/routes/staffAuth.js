import { Router } from 'express';
import { requireStaff } from '../middleware/auth.js';
import * as controller from '../controllers/staffAuth.js';

const router = Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.get('/me', requireStaff(), controller.me);
router.post('/logout', controller.logout);

export default router;
