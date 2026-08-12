import { Router } from 'express';
import * as ctrl from '../controllers/events.js';

const r = Router();

r.get('/', ctrl.list);
r.get('/summary', ctrl.summary);
r.get('/:id', ctrl.getById);

export default r;
