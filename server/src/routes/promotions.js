import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/promotions.js';
const r = Router();
r.get('/', ctrl.list);
r.post('/:id/claim', requireAuth, ctrl.claim);
export default r;
