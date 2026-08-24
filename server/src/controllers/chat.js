import {
  createRoom, getAllRooms, getRoomBySlug, updateRoom, deleteRoom,
  getRoomMessages, deleteMessage, banUserFromRoom, unbanUserFromRoom,
  muteUserInRoom, unmuteUserInRoom,
} from '../services/chat.js';

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

export async function updateRoomHandler(req, res, next) {
  try {
    const room = await updateRoom(req.params.id, req.validated);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function deleteRoomHandler(req, res, next) {
  try {
    await deleteRoom(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// ─── Admin — moderasyon ──────────────────────────────────────────────
export async function banUserHandler(req, res, next) {
  try {
    const room = await banUserFromRoom(req.params.id, req.validated.userId, req.user.id);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function unbanUserHandler(req, res, next) {
  try {
    const room = await unbanUserFromRoom(req.params.id, req.params.userId);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function muteUserHandler(req, res, next) {
  try {
    const { userId, duration, reason } = req.validated;
    const room = await muteUserInRoom(req.params.id, userId, duration, reason, req.user.id);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function unmuteUserHandler(req, res, next) {
  try {
    const room = await unmuteUserInRoom(req.params.id, req.params.userId);
    res.json({ room });
  } catch (e) { next(e); }
}

export async function deleteMessageHandler(req, res, next) {
  try {
    const message = await deleteMessage(req.params.id, req.user.id, { reason: req.body?.reason });
    res.json({ message });
  } catch (e) { next(e); }
}
