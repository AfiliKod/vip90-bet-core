import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { createRoomSchema, updateRoomSchema, banUserSchema, muteUserSchema } from '../validators/chat.js';
import * as ctrl from '../controllers/chat.js';

const r = Router();

// Public — oda listesi ve mesaj geçmişi (giriş yapmış herkes)
r.get('/rooms', requireAuth, ctrl.listPublicRooms);
r.get('/rooms/:slug/messages', requireAuth, ctrl.getRoomMessagesHandler);

// Admin — oda yönetimi
r.get('/admin/rooms', requireAuth, requireAdmin, ctrl.listAllRooms);
r.post('/admin/rooms', requireAuth, requireAdmin, auditLog('CHAT_ROOM_CREATE'), validate(createRoomSchema), ctrl.createRoomHandler);
r.patch('/admin/rooms/:id', requireAuth, requireAdmin, auditLog('CHAT_ROOM_UPDATE'), validate(updateRoomSchema), ctrl.updateRoomHandler);
r.delete('/admin/rooms/:id', requireAuth, requireAdmin, auditLog('CHAT_ROOM_DELETE'), ctrl.deleteRoomHandler);

// Admin — moderasyon
r.post('/admin/rooms/:id/ban', requireAuth, requireAdmin, auditLog('CHAT_BAN'), validate(banUserSchema), ctrl.banUserHandler);
r.delete('/admin/rooms/:id/ban/:userId', requireAuth, requireAdmin, auditLog('CHAT_UNBAN'), ctrl.unbanUserHandler);
r.post('/admin/rooms/:id/mute', requireAuth, requireAdmin, auditLog('CHAT_MUTE'), validate(muteUserSchema), ctrl.muteUserHandler);
r.delete('/admin/rooms/:id/mute/:userId', requireAuth, requireAdmin, auditLog('CHAT_UNMUTE'), ctrl.unmuteUserHandler);
r.delete('/admin/messages/:id', requireAuth, requireAdmin, auditLog('CHAT_MESSAGE_DELETE'), ctrl.deleteMessageHandler);

export default r;
