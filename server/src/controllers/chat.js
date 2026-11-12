import { scopeTenantId } from '../tenancy/tenantFilter.js';
import ChatRoom from '../models/ChatRoom.js';
import ChatMessage from '../models/ChatMessage.js';
import { createError } from '../middleware/error.js';
import {
  createRoom, getAllRooms, getRoomBySlug,
  updateRoom as updateRoomService, deleteRoom,
  getRoomMessages, deleteMessage as deleteMessageService, banUserFromRoom, unbanUserFromRoom,
  muteUserInRoom, unmuteUserInRoom, getModerationHistory,
} from '../services/chat.js';

// Cross-tenant :id lookups answer 404 (spec §9 G-3); existence is never disclosed.
async function assertRoomInTenant(roomId, tenantId) {
  if (!tenantId) return;
  const owned = await ChatRoom.exists({ _id: roomId, tenantId });
  if (!owned) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
}

async function assertMessageInTenant(messageId, tenantId) {
  if (!tenantId) return;
  const owned = await ChatMessage.exists({ _id: messageId, tenantId });
  if (!owned) throw createError(404, 'NOT_FOUND', 'Mesaj bulunamadı');
}

// ─── Public ──────────────────────────────────────────────────────────
export async function listPublicRooms(req, res, next) {
  try {
    const { rooms } = await getAllRooms({ status: 'active', limit: 100 });
    res.json({ rooms: rooms.filter(r => r.isPublic) });
  } catch (e) { next(e); }
}

export async function getRoomMessagesHandler(req, res, next) {
  try {
    const room = await getRoomBySlug(req.params.slug);
    if (!room) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Oda bulunamadı' } });
    const result = await getRoomMessages(room._id, { page: req.query.page, limit: req.query.limit, before: req.query.before });
    res.json({ room, ...result });
  } catch (e) { next(e); }
}

// ─── Admin — oda yönetimi ────────────────────────────────────────────
export async function listAllRooms(req, res, next) {
  try {
    res.json(await getAllRooms(req.query));
  } catch (e) { next(e); }
}

export async function createRoomHandler(req, res, next) {
  try {
    const room = await createRoom(req.validated, req.user.id);
    res.status(201).json({ room });
  } catch (e) { next(e); }
}

export async function updateRoom(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    const room = await updateRoomService(req.params.id, req.validated);
    res.json({ room });
  } catch (e) { next(e); }
}
export { updateRoom as updateRoomHandler };

export async function deleteRoomHandler(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    await deleteRoom(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// ─── Admin — moderasyon ──────────────────────────────────────────────
export async function banUserHandler(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    const room = await banUserFromRoom(req.params.id, req.validated.userId, req.user.id);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function unbanUserHandler(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    const room = await unbanUserFromRoom(req.params.id, req.params.userId);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function muteUserHandler(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    const { userId, duration, reason } = req.validated;
    const room = await muteUserInRoom(req.params.id, userId, duration, reason, req.user.id);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function unmuteUserHandler(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    const room = await unmuteUserInRoom(req.params.id, req.params.userId);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function deleteMessage(req, res, next) {
  try {
    await assertMessageInTenant(req.params.id, scopeTenantId(req));
    const message = await deleteMessageService(req.params.id, req.user.id, { admin: true, reason: req.body?.reason });
    res.json({ message });
  } catch (e) { next(e); }
}
export { deleteMessage as deleteMessageHandler };

export async function getModerationHistoryHandler(req, res, next) {
  try {
    await assertRoomInTenant(req.params.id, scopeTenantId(req));
    const { page, limit, action } = req.query;
    const result = await getModerationHistory(req.params.id, { page, limit, action });
    res.json(result);
  } catch (e) { next(e); }
}
