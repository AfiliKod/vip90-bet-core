import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createTicketSchema, replySchema, setStatusSchema } from '../validators/ticket.js';
import * as ctrl from '../controllers/ticket.js';

const r = Router();

// Oyuncu uçları
r.post('/mine', requireAuth, validate(createTicketSchema), ctrl.createMyTicket);
r.get('/mine', requireAuth, ctrl.listMyTickets);
r.get('/mine/:id', requireAuth, ctrl.getMyTicket);
r.post('/mine/:id/reply', requireAuth, validate(replySchema), ctrl.replyToMyTicket);

// Admin uçları
r.get('/', requireAuth, requireAdmin, ctrl.listAllTickets);
r.get('/:id', requireAuth, requireAdmin, ctrl.getAnyTicket);
r.post('/:id/reply', requireAuth, requireAdmin, validate(replySchema), ctrl.replyAsAdmin);
r.patch('/:id/status', requireAuth, requireAdmin, validate(setStatusSchema), ctrl.setTicketStatus);

export default r;
