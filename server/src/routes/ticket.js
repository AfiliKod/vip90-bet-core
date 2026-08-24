import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { createDemoAdminBlock } from '../middleware/demoAdmin.js';
import { createTicketSchema, replySchema, setStatusSchema } from '../validators/ticket.js';
import * as ctrl from '../controllers/ticket.js';
import User from '../models/User.js';

// V1 deseni (routes/admin.js) — demo yönetici oyuncu ticket'larına yanıt
// yazamaz/durum değiştiremez (görüntüleyebilir, veri değiştiremez).
const blockDemoAdmin = createDemoAdminBlock({
  getUserById: (id) => (id ? User.findById(id).select('isDemoAdmin').lean() : null),
});

const r = Router();

// Oyuncu uçları
r.post('/mine', requireAuth, validate(createTicketSchema), ctrl.createMyTicket);
r.get('/mine', requireAuth, ctrl.listMyTickets);
r.get('/mine/:id', requireAuth, ctrl.getMyTicket);
r.post('/mine/:id/reply', requireAuth, validate(replySchema), ctrl.replyToMyTicket);

// Admin uçları
r.get('/', requireAuth, requireAdmin, ctrl.listAllTickets);
r.get('/:id', requireAuth, requireAdmin, ctrl.getAnyTicket);
r.post('/:id/reply', requireAuth, requireAdmin, blockDemoAdmin, auditLog('TICKET_REPLY'), validate(replySchema), ctrl.replyAsAdmin);
r.patch('/:id/status', requireAuth, requireAdmin, blockDemoAdmin, auditLog('TICKET_STATUS_CHANGE'), validate(setStatusSchema), ctrl.setTicketStatus);

export default r;
