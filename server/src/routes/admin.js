import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, settleEventSchema, createUserSchema, updateBalanceSchema } from '../validators/admin.js';
import * as ctrl from '../controllers/admin.js';

const r = Router();
r.use(requireAuth, requireAdmin);

r.get('/users',                  ctrl.getUsers);
r.post('/users',                 validate(createUserSchema), ctrl.createUser);
r.patch('/users/:id',            ctrl.updateUser);
r.delete('/users/:id',           ctrl.deleteUser);
r.patch('/users/:id/balance',    validate(updateBalanceSchema), ctrl.updateBalance);
r.get('/users/:id/referrals',    ctrl.getReferrals);
r.get('/users/:id/transactions', ctrl.getUserTransactions);

r.get('/events/archived',    ctrl.getArchivedEvents);
r.post('/events',            validate(createEventSchema), ctrl.createEvent);
r.patch('/events/:id',       ctrl.updateEvent);
r.post('/events/:id/settle', validate(settleEventSchema), ctrl.settle);

r.get('/stats',       ctrl.getStats);
r.get('/tasks',       ctrl.getTasks);
r.patch('/tasks/:id', ctrl.updateTask);

r.get('/casino/stats',            ctrl.getCasinoStats);
r.get('/users/:id/casino-rounds', ctrl.getUserCasinoRounds);

export default r;
