import mongoose from 'mongoose';
import { socketAuthMiddleware } from './socketAuth.js';
import ChatRoom from '../models/ChatRoom.js';
import ChatMessage from '../models/ChatMessage.js';
import ChatRain from '../models/ChatRain.js';
import ChatTip from '../models/ChatTip.js';
import User from '../models/User.js';
import BonusWagering from '../models/BonusWagering.js';
import { getIO } from './socketEmitter.js';
import { createError } from '../middleware/error.js';
import { createTransaction, adjustBalance } from './ledger.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';
import { userHasPermission } from './permissions.js';
import { evaluateEligibility } from './responsibleGaming.js';
import { assertKycForWithdrawal } from '../middleware/kycGate.js';
import { assertRiskAllowed } from '../middleware/risk.js';
import { assertNoOpenIgamesSession } from './igamesSessionGuard.js';
import { adminIpAllowedForSocket } from '../middleware/adminIpAllowlist.js';
import { logAuditEvent } from './audit.js';
import { createSocketTenantResolver, socketPacketTenant, socketTenantMiddleware } from '../socket/tenant.js';
import { chatRoom } from '../tenancy/tenantKeys.js';
import { getTenancyMode } from '../config/tenancy.js';
import { publishToRoom } from '../socket/publish.js';

/**
 * Chat Room Management
 */

export async function createRoom(data, adminId, options = {}) {
  const { session = null } = options;
  
  const { name, description, icon, color, isPublic, minLevel, maxUsers, slowMode, rainSettings } = data;
  
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  if (await ChatRoom.findOne({ slug }).session(session)) {
    throw createError(409, 'ROOM_EXISTS', 'Bu isimde bir oda zaten var');
  }
  
  const room = await ChatRoom.create([{
    name,
    slug,
    description,
    icon,
    color,
    isPublic,
    minLevel,
    maxUsers,
    slowMode,
    rainEnabled: rainSettings?.enabled ?? true,
    rainMinAmount: rainSettings?.minAmount ?? 1,
    rainMaxAmount: rainSettings?.maxAmount ?? 100,
    rainCooldown: rainSettings?.cooldown ?? 300,
    rainMinUsers: rainSettings?.minUsers ?? 3,
    createdBy: adminId,
  }], { session });
  
  return room[0];
}

export async function getRoomBySlug(slug) {
  return ChatRoom.findOne({ slug, isActive: true }).populate('createdBy', 'username');
}

export async function getAllRooms(options = {}) {
  const { page = 1, limit = 20, status = 'all', search = '' } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { slug: { $regex: search, $options: 'i' } }];
  
  const [rooms, total] = await Promise.all([
    ChatRoom.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    ChatRoom.countDocuments(filter),
  ]);
  
  return { rooms, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

export async function updateRoom(roomId, updates, options = {}) {
  const { session = null } = options;
  
  const allowedUpdates = ['name', 'description', 'icon', 'color', 'isPublic', 'isActive', 'minLevel', 'maxUsers', 'slowMode', 'rainEnabled', 'rainMinAmount', 'rainMaxAmount', 'rainCooldown', 'rainMinUsers'];
  const updateData = Object.fromEntries(Object.entries(updates).filter(([k]) => allowedUpdates.includes(k)));
  
  // If name changed, update slug
  if (updateData.name) {
    updateData.slug = updateData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = await ChatRoom.findOne({ slug: updateData.slug, _id: { $ne: roomId } }).session(session);
    if (existing) throw createError(409, 'ROOM_EXISTS', 'Bu isimde bir oda zaten var');
  }
  
  const room = await ChatRoom.findByIdAndUpdate(roomId, updateData, { new: true, session, runValidators: true });
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  return room;
}

export async function deleteRoom(roomId, options = {}) {
  const { session = null } = options;
  
  const room = await ChatRoom.findByIdAndDelete(roomId).session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  // Also delete messages
  await ChatMessage.deleteMany({ roomId: room._id }).session(session);
  
  return true;
}

/**
 * Chat Message Management
 */

export async function sendMessage(userId, roomId, message, type = 'text', options = {}) {
  const { session = null, metadata = {} } = options;
  
  const room = await ChatRoom.findById(roomId).session(session);
  if (!room) throw createError(404, 'ROOM_NOT_FOUND', 'Oda bulunamadı');
  if (!room.isActive) throw createError(403, 'ROOM_INACTIVE', 'Oda kapalı');
  
  // Check if user is banned
  if (room.bannedUsers.some(id => id.equals(userId))) {
    throw createError(403, 'BANNED', 'Bu odadan yasaklısınız');
  }
  
  // Check mute
  const mute = room.mutedUsers.find(m => m.userId.equals(userId) && (!m.until || m.until > new Date()));
  if (mute) {
    throw createError(403, 'MUTED', `Susturuldunuz: ${mute.reason || 'Sebep belirtilmemiş'}`);
  }
  
  // Check slow mode
  if (room.slowMode > 0) {
    const lastMsg = await ChatMessage.findOne({ userId, roomId }).sort({ createdAt: -1 }).session(session);
    if (lastMsg && Date.now() - lastMsg.createdAt.getTime() < room.slowMode * 1000) {
      throw createError(429, 'SLOW_MODE', `Yavaş mod aktif. ${room.slowMode} saniye bekleyin.`);
    }
  }
  
  const chatMessage = await ChatMessage.create([{
    roomId,
    userId,
    message,
    type,
    metadata,
  }], { session });
  
  const msg = chatMessage[0];
  
  // Update room stats
  room.stats.totalMessages += 1;
  await room.save({ session });
  
  // Emit real-time
  const io = getIO();
  if (io) {
    const populatedMsg = await ChatMessage.findById(msg._id)
      .populate('userId', 'username avatarColor')
      .session(session);
    publishToRoom(chatRoom(null, roomId), 'chat:message', populatedMsg, { namespace: '/chat', io });
  }
  
  return msg;
}

export async function getRoomMessages(roomId, options = {}) {
  const { page = 1, limit = 50, before = null } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = { roomId, isDeleted: false };
  if (before) filter.createdAt = { $lt: new Date(before) };
  
  const [messages, total] = await Promise.all([
    ChatMessage.find(filter)
      .populate('userId', 'username avatarColor vipLevel')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ChatMessage.countDocuments(filter),
  ]);
  
  return { messages: messages.reverse(), total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

export async function deleteMessage(messageId, actorId, options = {}) {
  const { session = null, reason = '', admin = false } = options;
  
  const message = await ChatMessage.findById(messageId).session(session);
  if (!message) throw createError(404, 'NOT_FOUND', 'Mesaj bulunamadı');
  // Only the REST admin path (permission-gated in routes/chat.js) passes admin: true.
  if (admin !== true && String(message.userId) !== String(actorId)) {
    throw createError(403, 'FORBIDDEN', 'Yalnızca kendi mesajınızı silebilirsiniz');
  }
  // Already deleted: no write, no audit, no emit (keeps the first moderation attribution).
  if (message.isDeleted) return message;
  
  message.isDeleted = true;
  message.deletedBy = actorId;
  message.deletedAt = new Date();
  message.deleteReason = reason;
  await message.save({ session });
  
  // Audit only moderator deletions; a player deleting their own message is not an admin action.
  if (admin === true) {
    const actor = await User.findById(actorId).select('username');
    await logAuditEvent({
      actorId,
      actorType: 'admin',
      actorUsername: actor?.username || 'unknown',
      action: 'CHAT_MESSAGE_DELETE',
      category: 'chat',
      targetType: 'chat',
      targetId: messageId,
      before: { message: message.message },
      after: { isDeleted: true, deleteReason: reason },
      reason,
      metadata: { roomId: message.roomId, userId: message.userId },
    });
  }
  
  // Emit real-time
  const io = getIO();
  if (io) {
    publishToRoom(chatRoom(null, message.roomId), 'chat:messageDeleted', { messageId: message._id }, { namespace: '/chat', io });
  }
  
  return message;
}

export async function editMessage(messageId, userId, newMessage, options = {}) {
  const { session = null } = options;
  
  const message = await ChatMessage.findById(messageId).session(session);
  if (!message) throw createError(404, 'NOT_FOUND', 'Mesaj bulunamadı');
  if (!message.userId.equals(userId)) throw createError(403, 'FORBIDDEN', 'Kendi mesajınızı düzenleyebilirsiniz');
  if (message.isDeleted) throw createError(400, 'DELETED', 'Silinmiş mesaj düzenlenemez');
  
  message.originalMessage = message.message;
  message.message = newMessage;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save({ session });
  
  const io = getIO();
  if (io) {
    publishToRoom(chatRoom(null, message.roomId), 'chat:messageEdited', { messageId: message._id, message: newMessage }, { namespace: '/chat', io });
  }
  
  return message;
}

/**
 * Moderation
 */

export async function banUserFromRoom(roomId, userId, adminId, options = {}) {
  const { session = null, reason = '' } = options;
  
  const room = await ChatRoom.findById(roomId).session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  if (room.bannedUsers.some(id => id.equals(userId))) {
    throw createError(409, 'ALREADY_BANNED', 'Kullanıcı zaten yasaklı');
  }
  
  room.bannedUsers.push(userId);
  await room.save({ session });
  
  // Log audit event
  const admin = await User.findById(adminId).select('username');
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: admin?.username || 'unknown',
    action: 'CHAT_BAN',
    category: 'chat',
    targetType: 'chat',
    targetId: roomId.toString(),
    before: { bannedUsers: room.bannedUsers.filter(id => !id.equals(userId)) },
    after: { bannedUsers: room.bannedUsers },
    reason,
    metadata: { roomId, userId },
  });
  
  // Remove user from room if connected
  const io = getIO();
  if (io) {
    publishToRoom(chatRoom(null, roomId), 'chat:userBanned', { userId, roomId }, { namespace: '/chat', io });
  }
  
  return room;
}

export async function unbanUserFromRoom(roomId, userId, options = {}) {
  const { session = null } = options;
  
  const room = await ChatRoom.findByIdAndUpdate(
    roomId,
    { $pull: { bannedUsers: userId } },
    { new: true, session }
  );
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  return room;
}

export async function muteUserInRoom(roomId, userId, duration, reason, adminId, options = {}) {
  const { session = null } = options;
  
  const room = await ChatRoom.findById(roomId).session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  const until = new Date(Date.now() + duration * 1000);
  
  // Remove existing mute if any
  room.mutedUsers = room.mutedUsers.filter(m => !m.userId.equals(userId));
  room.mutedUsers.push({ userId, until, reason });
  await room.save({ session });
  
  // Log audit event
  const admin = await User.findById(adminId).select('username');
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: admin?.username || 'unknown',
    action: 'CHAT_MUTE',
    category: 'chat',
    targetType: 'chat',
    targetId: roomId.toString(),
    after: { userId, until, reason },
    reason,
    metadata: { roomId, userId, duration },
  });
  
  const io = getIO();
  if (io) {
    publishToRoom(chatRoom(null, roomId), 'chat:userMuted', { userId, roomId, until, reason }, { namespace: '/chat', io });
  }
  
  return room;
}

export async function unmuteUserInRoom(roomId, userId, options = {}) {
  const { session = null } = options;
  
  const room = await ChatRoom.findByIdAndUpdate(
    roomId,
    { $pull: { mutedUsers: { userId } } },
    { new: true, session }
  );
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  const io = getIO();
  if (io) {
    publishToRoom(chatRoom(null, roomId), 'chat:userUnmuted', { userId, roomId }, { namespace: '/chat', io });
  }
  
  return room;
}

/**
 * Money movement shared by rain and tip (V8).
 *
 * Every write runs in ONE MongoDB transaction (withTransactionRetry): the
 * sender's debit, every credit, every ledger row and the ChatRain/ChatTip
 * record commit together or not at all. The client's requestId is scoped to
 * the acting user (`<userId>:<requestId>`) and stored on the record under a
 * unique index; ledger idempotency keys derive from it, so a retry or a
 * double click returns the first result and never writes money twice.
 */

const MAX_RAIN_RECIPIENTS = 50;
const MAX_REQUEST_ID_LENGTH = 128;

function scopedRequestId(userId, requestId) {
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > MAX_REQUEST_ID_LENGTH) {
    throw createError(400, 'REQUEST_ID_REQUIRED', 'requestId is required');
  }
  return `${String(userId)}:${requestId}`;
}

/** Positive amount with at most two decimals, as integer cents. */
function toCents(amount) {
  const c = typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
  if (!Number.isSafeInteger(c) || c <= 0 || Math.abs(c - amount * 100) > 1e-6) {
    throw createError(400, 'INVALID_AMOUNT', 'Geçersiz tutar');
  }
  return c;
}

const fromCents = (c) => c / 100;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Splits `totalAmount` over `count` recipients in cents so the parts sum to
 * the total exactly: everyone gets floor(total/count) cents and the first
 * `remainder` recipients get one cent more.
 */
export function splitRainAmount(totalAmount, count) {
  const totalCents = toCents(totalAmount);
  if (!Number.isInteger(count) || count < 1) throw createError(400, 'INVALID_AMOUNT', 'Geçersiz alıcı sayısı');
  const per = Math.floor(totalCents / count);
  const remainder = totalCents - per * count;
  return Array.from({ length: count }, (_, i) => fromCents(per + (i < remainder ? 1 : 0)));
}

function isDuplicateWrite(e) {
  return e?.code === 'DUPLICATE_TRANSACTION' || (e?.code === 11000 && (e?.keyPattern?.requestId || e?.keyPattern?.idempotencyKey));
}

/**
 * Debits `amount` from what the user could withdraw, inside `session`:
 * refused when the responsible-gaming evaluation for `rgAction` blocks or
 * restricts (same codes as enforceResponsibleGaming) or during a withdrawal
 * lock (a tip is a transfer out, it must not bypass the cash-out gates), and
 * never from bonus money still under wagering
 * (balance - active BonusWagering.bonusAmount, same rule as the withdrawal
 * gate in getSpendableBreakdown). Unprocessed expired wagerings still count
 * as locked here, which only errs on the strict side.
 */
async function debitWithdrawable(userId, amount, session, { rgAction = 'transfer', rgEvaluate = evaluateEligibility } = {}) {
  const user = await User.findById(userId)
    .select('username isActive accountRestricted responsibleLimits withdrawalLockUntil')
    .session(session);
  if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');
  const rg = user.isActive === false ? 'BLOCK' : rgEvaluate(user, rgAction, { amount });
  if (rg === 'BLOCK') throw createError(403, 'ACCOUNT_RESTRICTED', 'Hesabınız sorumlu oyun nedeniyle kısıtlıdır');
  if (rg === 'RESTRICT') throw createError(403, 'LIMIT_EXCEEDED', 'Sorumlu oyun limitiniz aşıldı');
  if (user.withdrawalLockUntil && user.withdrawalLockUntil > new Date()) {
    throw createError(403, 'WITHDRAWAL_LOCKED', 'Para transferi geçici olarak kilitli');
  }
  const active = await BonusWagering.find({ userId, status: 'active' }).select('bonusAmount').session(session).lean();
  const locked = round2(active.reduce((sum, w) => sum + (w.bonusAmount || 0), 0));

  const doc = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: round2(amount + locked) } },
    [{ $set: { balance: { $round: [{ $add: ['$balance', -amount] }, 2] } } }],
    { session, new: true },
  );
  if (!doc) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
  return { doc, balanceBefore: round2(doc.balance + amount), balanceAfter: doc.balance };
}

/**
 * Rain (Yağmur Dağıtımı)
 *
 * Only an admin holding `admin:users:balance` may rain (role and permission
 * read from the DB, never from the socket's JWT claims). The rain is funded
 * from the creator's own withdrawable balance; amount, per-user share,
 * recipient count and cooldown are bounded by the room's rain settings.
 */
export async function createRain(roomId, createdBy, options = {}) {
  const { totalAmount, requestId } = options;
  const key = scopedRequestId(createdBy, requestId);

  const existing = await ChatRain.findOne({ requestId: key });
  if (existing) {
    if (String(existing.createdBy) !== String(createdBy)) throw createError(403, 'FORBIDDEN', 'Yetkisiz');
    return existing;
  }

  const creator = await User.findById(createdBy).select('role').lean();
  if (creator?.role !== 'admin' || !(await userHasPermission(createdBy, 'admin:users:balance'))) {
    throw createError(403, 'FORBIDDEN', 'Yağmur başlatma yetkiniz yok');
  }
  // V19b: rain pays out of the creator's balance like a withdrawal.
  await assertNoOpenIgamesSession(createdBy);

  const room = await ChatRoom.findById(roomId);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  if (!room.rainEnabled) throw createError(403, 'RAIN_DISABLED', 'Bu odada yağmur dağıtımı kapalı');

  const totalCents = toCents(totalAmount);
  const total = fromCents(totalCents);

  // Active users (socket presence) are read OUTSIDE the transaction. One user
  // with several tabs counts once; the creator never rains on themselves;
  // only existing, active accounts can receive.
  const io = getIO();
  let socketUserIds = [];
  if (io) {
    const roomSockets = await io.of('/chat').in(chatRoom(null, roomId)).fetchSockets();
    socketUserIds = [...new Set(roomSockets.map(s => s.user?.id).filter(Boolean).map(String))]
      .filter(id => id !== String(createdBy) && mongoose.isValidObjectId(id));
  }
  const eligible = socketUserIds.length
    ? (await User.find({ _id: { $in: socketUserIds }, isActive: { $ne: false }, isSeed: { $ne: true } }).select('_id').lean()).map(u => String(u._id))
    : [];

  if (eligible.length < room.rainMinUsers) {
    throw createError(400, 'NOT_ENOUGH_USERS', `Minimum ${room.rainMinUsers} aktif kullanıcı gerekli`);
  }

  const recipientCount = Math.min(eligible.length, MAX_RAIN_RECIPIENTS);
  const amounts = splitRainAmount(total, recipientCount);
  if (Math.min(...amounts) < room.rainMinAmount || Math.max(...amounts) > room.rainMaxAmount) {
    throw createError(400, 'INVALID_AMOUNT', 'Dağıtım miktarı sınırlar dışında');
  }

  // Fisher-Yates shuffle, then take the first recipientCount.
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const recipients = eligible.slice(0, recipientCount);

  let outcome;
  const session = await mongoose.startSession();
  try {
    outcome = await withTransactionRetry(session, async () => {
      const dup = await ChatRain.findOne({ requestId: key }).session(session);
      if (dup) return { rain: dup, created: false };

      // Writing the room first makes concurrent rains in this room conflict,
      // so the cooldown read below is serialised (the loser retries and sees
      // the committed rain).
      await ChatRoom.updateOne(
        { _id: roomId },
        { $inc: { 'stats.totalRainAmount': total, 'stats.totalRainCount': 1 } },
        { session },
      );
      const lastRain = await ChatRain.findOne({ roomId, status: 'completed' }).sort({ completedAt: -1 }).session(session);
      if (lastRain?.completedAt && Date.now() - lastRain.completedAt.getTime() < room.rainCooldown * 1000) {
        throw createError(429, 'RAIN_COOLDOWN', 'Yağmur dağıtımı bekleme süresi devam ediyor');
      }

      const debit = await debitWithdrawable(createdBy, total, session);

      const [rain] = await ChatRain.create([{
        roomId,
        createdBy,
        requestId: key,
        totalAmount: total,
        totalRecipients: recipientCount,
        amountPerUser: amounts[amounts.length - 1],
        status: 'distributing',
        settings: { minAmount: room.rainMinAmount, maxAmount: room.rainMaxAmount, minUsers: room.rainMinUsers },
      }], { session });

      const { transaction: creatorTx } = await createTransaction({
        userId: createdBy,
        type: 'rain',
        amount: -total,
        balanceBefore: debit.balanceBefore,
        balanceAfter: debit.balanceAfter,
        idempotencyKey: `rain_${key}_creator`,
        source: 'admin',
        createdBy,
        metadata: { roomId, rainId: rain._id, recipients: recipientCount },
      }, { session });

      const credited = [];
      for (let i = 0; i < recipients.length; i++) {
        const userId = recipients[i];
        const amount = amounts[i];
        const credit = await adjustBalance(userId, amount, { session });
        if (!credit) throw createError(409, 'RAIN_RECIPIENT_MISSING', 'Alıcı bulunamadı');
        const { transaction } = await createTransaction({
          userId,
          type: 'rain',
          amount,
          balanceBefore: credit.balanceBefore,
          balanceAfter: credit.balanceAfter,
          idempotencyKey: `rain_${key}_${userId}`,
          source: 'admin',
          createdBy,
          metadata: { roomId, rainId: rain._id, rainCreator: createdBy },
          relatedTransactionId: creatorTx._id,
        }, { session });
        rain.recipients.push({ userId, amount, transactionId: transaction._id, claimedAt: new Date() });
        credited.push({ userId, amount, balance: credit.balanceAfter });
      }

      rain.status = 'completed';
      rain.completedAt = new Date();
      await rain.save({ session });

      return { rain, created: true, credited, creatorBalance: debit.balanceAfter };
    });
  } catch (e) {
    if (isDuplicateWrite(e)) {
      const again = await ChatRain.findOne({ requestId: key });
      if (again) return again;
    }
    throw e;
  } finally {
    await session.endSession();
  }

  // Emits only after commit, and only for the call that wrote the rain.
  if (outcome.created && io) {
    io.to(`user:${createdBy}`).emit('balance:update', { balance: outcome.creatorBalance });
    for (const { userId, amount, balance } of outcome.credited) {
      io.to(`user:${userId}`).emit('balance:update', { balance });
      publishToRoom(chatRoom(null, roomId), 'chat:rainReceived', { userId, amount }, { namespace: '/chat', io });
    }
    publishToRoom(chatRoom(null, roomId), 'chat:rain', { rainId: outcome.rain._id, totalAmount: total, recipients: outcome.rain.recipients.length }, { namespace: '/chat', io });
  }

  return outcome.rain;
}

/**
 * Tips (Bahşiş)
 */

async function tipInSession(fromUserId, toUserId, roomId, amount, message, key, session, rgEvaluate) {
  const dup = await ChatTip.findOne({ requestId: key }).session(session);
  if (dup) return { tip: dup, created: false };

  const room = await ChatRoom.findById(roomId).select('isActive bannedUsers mutedUsers tenantId').session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  if (!room.isActive) throw createError(403, 'ROOM_INACTIVE', 'Oda kapalı');
  // Same rules as sendMessage: a banned or muted sender cannot tip in this room.
  if ((room.bannedUsers || []).some(id => String(id) === String(fromUserId))) {
    throw createError(403, 'BANNED', 'Bu odadan yasaklısınız');
  }
  if ((room.mutedUsers || []).some(m => String(m.userId) === String(fromUserId) && (!m.until || m.until > new Date()))) {
    throw createError(403, 'MUTED', 'Susturuldunuz');
  }

  const fromUser = await User.findById(fromUserId).session(session);
  if (!fromUser) throw createError(404, 'SENDER_NOT_FOUND', 'Gönderen bulunamadı');

  const toUser = await User.findById(toUserId).select('username isActive tenantId').session(session);
  if (!toUser || toUser.isActive === false) throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');

  // Multi-tenant containment (§3 #6, §8.3): recipient and room must belong to
  // the sender's tenant. A foreign id answers 404, never reveals existence.
  if (fromUser.tenantId && toUser.tenantId && String(fromUser.tenantId) !== String(toUser.tenantId)) {
    throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');
  }
  if (fromUser.tenantId && room.tenantId && String(fromUser.tenantId) !== String(room.tenantId)) {
    throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  }

  // Atomic conditional debit: two concurrent tips cannot both see enough balance.
  const debit = await debitWithdrawable(fromUserId, amount, session, { rgAction: 'withdraw', rgEvaluate });
  const tipId = `tip_${key}`;

  const { transaction: fromTransaction } = await createTransaction({
    userId: fromUserId,
    type: 'tip_sent',
    amount: -amount,
    balanceBefore: debit.balanceBefore,
    balanceAfter: debit.balanceAfter,
    idempotencyKey: `${tipId}_sent`,
    source: 'player',
    metadata: { roomId, recipientUsername: toUser.username },
    relatedTransactionId: null,
  }, { session });

  const credit = await adjustBalance(toUserId, amount, { session });
  if (!credit) throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');

  const { transaction: toTransaction } = await createTransaction({
    userId: toUserId,
    type: 'tip_received',
    amount,
    balanceBefore: credit.balanceBefore,
    balanceAfter: credit.balanceAfter,
    idempotencyKey: `${tipId}_received`,
    source: 'player',
    metadata: { roomId, senderUsername: debit.doc.username },
    relatedTransactionId: fromTransaction._id,
  }, { session });

  const [tip] = await ChatTip.create([{
    roomId,
    fromUserId,
    toUserId,
    amount,
    message,
    requestId: key,
    fromTransactionId: fromTransaction._id,
    toTransactionId: toTransaction._id,
    status: 'completed',
  }], { session });

  return {
    tip,
    created: true,
    fromUsername: debit.doc.username,
    toUsername: toUser.username,
    fromBalance: debit.balanceAfter,
    toBalance: credit.balanceAfter,
  };
}

/**
 * Cross-tenant containment (§3 #6, §8.3): sender, recipient and room must share
 * a tenant. Runs before any gate or money movement so a foreign id answers 404
 * (RECIPIENT_NOT_FOUND for the recipient) and never reveals that it exists.
 */
async function assertTipTenantContainment(fromUserId, toUserId, roomId, session) {
  const fromUser = await User.findById(fromUserId).select('tenantId').session(session);
  if (!fromUser) throw createError(404, 'SENDER_NOT_FOUND', 'Gönderen bulunamadı');
  const toUser = await User.findById(toUserId).select('isActive tenantId').session(session);
  if (!toUser || toUser.isActive === false) throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');
  if (fromUser.tenantId && toUser.tenantId && String(fromUser.tenantId) !== String(toUser.tenantId)) {
    throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');
  }
  const room = await ChatRoom.findById(roomId).select('tenantId').session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  if (fromUser.tenantId && room.tenantId && String(fromUser.tenantId) !== String(room.tenantId)) {
    throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  }
}

/**
 * A tip moves cash to another player, so the SENDER passes the same gates as a
 * withdrawal (routes/bank.js /withdraw): KYC (assertKycForWithdrawal), the
 * risk check for 'withdraw' (assertRiskAllowed) and the responsible-gaming
 * 'withdraw' evaluation (inside the transaction, on the debited user).
 * `cashOutGates` is a test seam ({ kyc: kycGate deps, risk: risk check fn,
 * rg: evaluateEligibility-like fn }); the socket handler never passes it.
 */
export async function sendTip(fromUserId, toUserId, roomId, amount, message, options = {}) {
  const { requestId, session = null, cashOutGates = {} } = options;

  // String karşılaştırması: fromUserId socket üzerinden JWT'den (düz string)
  // gelebilir, toUserId ise string veya ObjectId — String() ile normalize edilir.
  if (String(fromUserId) === String(toUserId)) throw createError(400, 'SELF_TIP', 'Kendinize bahşiş gönderemezsiniz');
  const value = fromCents(toCents(amount));
  const text = typeof message === 'string' ? message.slice(0, 500) : '';

  await assertTipTenantContainment(fromUserId, toUserId, roomId, session);

  const key = scopedRequestId(fromUserId, requestId);

  // A completed tip is returned as is (no gate may turn a retry into an error).
  const prior = await ChatTip.findOne({ requestId: key }).session(session);
  if (prior) return prior;

  await assertNoOpenIgamesSession(fromUserId);
  await assertKycForWithdrawal(fromUserId, cashOutGates.kyc);
  await assertRiskAllowed(fromUserId, 'withdraw', { amount: value }, cashOutGates.risk);
  const rgEvaluate = cashOutGates.rg || evaluateEligibility;

  let outcome;
  if (session) {
    // Caller owns the transaction (and its retry); a duplicate inside it aborts the caller.
    outcome = await tipInSession(fromUserId, toUserId, roomId, value, text, key, session, rgEvaluate);
  } else {
    const own = await mongoose.startSession();
    try {
      outcome = await withTransactionRetry(own, () => tipInSession(fromUserId, toUserId, roomId, value, text, key, own, rgEvaluate));
    } catch (e) {
      if (isDuplicateWrite(e)) {
        const again = await ChatTip.findOne({ requestId: key });
        if (again) return again;
      }
      throw e;
    } finally {
      await own.endSession();
    }
  }

  if (!outcome.created) return outcome.tip;

  const { tip } = outcome;
  const ioInstance = getIO();
  if (ioInstance) {
    ioInstance.to(`user:${fromUserId}`).emit('balance:update', { balance: outcome.fromBalance });
    ioInstance.to(`user:${toUserId}`).emit('balance:update', { balance: outcome.toBalance });
    publishToRoom(chatRoom(null, roomId), 'chat:tip', {
      tipId: tip._id,
      fromUser: outcome.fromUsername,
      toUser: outcome.toUsername,
      amount: value,
      message: text,
    }, { namespace: '/chat', io: ioInstance });
  }

  // Chat announcement after commit; a failure here does not undo the tip.
  try {
    await sendMessage(fromUserId, roomId, `💸 ${outcome.toUsername} kullanıcısına ${value} bahşiş gönderdi${text ? ': ' + text : ''}`, 'tip', { metadata: { tipId: tip._id } });
  } catch (e) {
    console.warn('[chat] tip announcement failed:', e.message);
  }

  return tip;
}

/** Server açılışında bir kez çağrılır (idempotent) — hiç oda yoksa "Genel Sohbet" odasını oluşturur. */
export async function initDefaultChatRoom() {
  const count = await ChatRoom.countDocuments();
  if (count > 0) return;
  await ChatRoom.create({
    name: 'Genel Sohbet',
    slug: 'genel-sohbet',
    description: 'Tüm oyuncular için genel sohbet odası',
    icon: '💬',
    color: '#7c3aed',
    isPublic: true,
    isActive: true,
  });
}

export async function getUserTips(userId, options = {}) {
  const { page = 1, limit = 20, type = 'all' } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = type === 'sent' ? { fromUserId: userId } : type === 'received' ? { toUserId: userId } : { $or: [{ fromUserId: userId }, { toUserId: userId }] };
  
  const [tips, total] = await Promise.all([
    ChatTip.find(filter)
      .populate('fromUserId', 'username avatarColor')
      .populate('toUserId', 'username avatarColor')
      .populate('roomId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ChatTip.countDocuments(filter),
  ]);
  
  return { tips, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

export async function getRoomTips(roomId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const [tips, total] = await Promise.all([
    ChatTip.find({ roomId })
      .populate('fromUserId', 'username avatarColor')
      .populate('toUserId', 'username avatarColor')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ChatTip.countDocuments({ roomId }),
  ]);
  
  return { tips, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Moderation History
 */

export async function getModerationHistory(roomId, options = {}) {
  const { page = 1, limit = 20, action = null } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const query = { targetType: 'chat', 'metadata.roomId': roomId.toString() };
  if (action) query.action = action;

  const AuditLog = (await import('../models/AuditLog.js')).default;
  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('actorId', 'username'),
    AuditLog.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Socket Events
 */

export function initChatSocket(io, { resolveSocketTenant = createSocketTenantResolver() } = {}) {
  const chatNS = io.of('/chat');

  chatNS.use(socketTenantMiddleware(resolveSocketTenant));
  chatNS.use(socketAuthMiddleware);

  chatNS.on('connection', (socket) => {
    socket.use((_event, next) => socketPacketTenant(socket, next));
    socket.on('chat:join', async ({ roomId } = {}) => {
      const tenantId = socket.data?.tenantId ?? null;
      if (!roomId) return;
      // Multi mode needs a bound tenant; single mode without one uses today's room name.
      if (!tenantId && getTenancyMode() !== 'single') return;
      try {
        const room = await ChatRoom.findById(roomId).select('_id').lean();
        if (!room) return socket.emit('chat:error', { code: 'ROOM_NOT_FOUND', message: 'Oda bulunamadı' });
        socket.join(chatRoom(tenantId, roomId));
      } catch {
        socket.emit('chat:error', { code: 'ROOM_NOT_FOUND', message: 'Oda bulunamadı' });
      }
    });
    
    socket.on('chat:leave', ({ roomId } = {}) => {
      if (!roomId) return;
      socket.leave(chatRoom(socket.data?.tenantId ?? null, roomId));
    });
    
    socket.on('chat:send', async ({ roomId, message, type = 'text' }) => {
      try {
        const msg = await sendMessage(socket.user.id, roomId, message, type);
        socket.emit('chat:messageSent', { messageId: msg._id });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('chat:delete', async ({ messageId }) => {
      try {
        await deleteMessage(messageId, socket.user.id, { admin: false });
        socket.emit('chat:messageDeleted', { messageId });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('chat:edit', async ({ messageId, message }) => {
      try {
        await editMessage(messageId, socket.user.id, message);
        socket.emit('chat:messageEdited', { messageId });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('chat:tip', async ({ roomId, toUserId, amount, message, requestId } = {}) => {
      try {
        await sendTip(socket.user.id, toUserId, roomId, amount, message, { requestId });
        socket.emit('chat:tipSent', { toUserId, amount, requestId });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('chat:rain', async ({ roomId, totalAmount, requestId } = {}) => {
      try {
        if (!adminIpAllowedForSocket(socket)) throw createError(403, 'IP_NOT_ALLOWED', 'Bu IP adresinden erişim yok');
        const rain = await createRain(roomId, socket.user.id, { totalAmount, requestId });
        socket.emit('chat:rainCreated', { rainId: rain._id, requestId });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('disconnect', () => {
      // Cleanup
    });
  });
}
