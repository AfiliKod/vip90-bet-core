import jwt from 'jsonwebtoken';
import ChatRoom from '../models/ChatRoom.js';
import ChatMessage from '../models/ChatMessage.js';
import ChatRain from '../models/ChatRain.js';
import ChatTip from '../models/ChatTip.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { getIO } from './socketEmitter.js';
import { createError } from '../middleware/error.js';
import { createTransaction } from './ledger.js';
import { logAuditEvent } from './audit.js';

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
    io.of('/chat').to(`room:${roomId}`).emit('chat:message', populatedMsg);
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

export async function deleteMessage(messageId, adminId, options = {}) {
  const { session = null, reason = '' } = options;
  
  const message = await ChatMessage.findById(messageId).session(session);
  if (!message) throw createError(404, 'NOT_FOUND', 'Mesaj bulunamadı');
  
  message.isDeleted = true;
  message.deletedBy = adminId;
  message.deletedAt = new Date();
  message.deleteReason = reason;
  await message.save({ session });
  
  // Log audit event
  const admin = await User.findById(adminId).select('username');
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: admin?.username || 'unknown',
    action: 'CHAT_MESSAGE_DELETE',
    category: 'chat',
    targetType: 'chat',
    targetId: messageId,
    before: { message: message.message },
    after: { isDeleted: true, deleteReason: reason },
    reason,
    metadata: { roomId: message.roomId, userId: message.userId },
  });
  
  // Emit real-time
  const io = getIO();
  if (io) {
    io.of('/chat').to(`room:${message.roomId}`).emit('chat:messageDeleted', { messageId: message._id });
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
    io.of('/chat').to(`room:${message.roomId}`).emit('chat:messageEdited', { messageId: message._id, message: newMessage });
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
    io.of('/chat').to(`room:${roomId}`).emit('chat:userBanned', { userId, roomId });
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
    io.of('/chat').to(`room:${roomId}`).emit('chat:userMuted', { userId, roomId, until, reason });
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
    io.of('/chat').to(`room:${roomId}`).emit('chat:userUnmuted', { userId, roomId });
  }
  
  return room;
}

/**
 * Rain (Yağmur Dağıtımı)
 */

export async function createRain(roomId, createdBy, options = {}) {
  const { session = null, totalAmount, minAmount, maxAmount } = options;
  
  const room = await ChatRoom.findById(roomId).session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  if (!room.rainEnabled) throw createError(403, 'RAIN_DISABLED', 'Bu odada yağmur dağıtımı kapalı');
  
  // Check cooldown
  const lastRain = await ChatRain.findOne({ roomId, status: 'completed' }).sort({ completedAt: -1 }).session(session);
  if (lastRain && Date.now() - lastRain.completedAt.getTime() < room.rainCooldown * 1000) {
    throw createError(429, 'RAIN_COOLDOWN', 'Yağmur dağıtımı bekleme süresi devam ediyor');
  }
  
  // Check active users
  const io = getIO();
  let activeUsers = [];
  if (io) {
    const roomSockets = await io.of('/chat').in(`room:${roomId}`).fetchSockets();
    activeUsers = roomSockets.map(s => s.user?.id).filter(Boolean);
  }
  
  if (activeUsers.length < room.rainMinUsers) {
    throw createError(400, 'NOT_ENOUGH_USERS', `Minimum ${room.rainMinUsers} aktif kullanıcı gerekli`);
  }
  
  // Calculate amounts
  const recipientCount = Math.min(activeUsers.length, 50); // Max 50 recipients
  const amountPerUser = Math.floor(totalAmount / recipientCount);
  
  if (amountPerUser < room.rainMinAmount || amountPerUser > room.rainMaxAmount) {
    throw createError(400, 'INVALID_AMOUNT', 'Dağıtım miktarı sınırlar dışında');
  }
  
  // Create rain record — Model.create([{...}], {session}) İLK ARGÜMANI ARRAY
  // olduğunda Mongoose HER ZAMAN array döner (session olsun olmasın); bu
  // oturumda tekrar tekrar bulunan bir bug deseni (web3Auth.js/socialAuth.js'de
  // de aynısı vardı). Array destructure ile tekil dokümana indirgenir.
  const [rain] = await ChatRain.create([{
    roomId,
    createdBy,
    totalAmount,
    totalRecipients: recipientCount,
    amountPerUser,
    status: 'pending',
    settings: { minAmount: room.rainMinAmount, maxAmount: room.rainMaxAmount, minUsers: room.rainMinUsers },
  }], { session });
  
  // Select random recipients
  const shuffled = activeUsers.sort(() => 0.5 - Math.random());
  const recipients = shuffled.slice(0, recipientCount);
  
  // Distribute — atomic $inc (routes/inhouse.js deseni): read-modify-write
  // yerine tek operasyonda güncellenir, eşzamanlı bir işlemin kaybolmasını önler.
  const rainId = `rain_${roomId}_${createdBy}_${Date.now()}`;
  for (const userId of recipients) {
    const user = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { balance: amountPerUser } },
      { session, new: true },
    );
    if (!user) continue;

    const balanceBefore = parseFloat((user.balance - amountPerUser).toFixed(2));

    const { transaction } = await createTransaction({
      userId,
      type: 'rain',
      amount: amountPerUser,
      balanceBefore,
      balanceAfter: user.balance,
      idempotencyKey: `${rainId}_${userId}`,
      source: 'player',
      metadata: { roomId, rainCreator: createdBy },
      relatedTransactionId: rain._id,
    }, { session });
    
    rain.recipients.push({ userId, amount: amountPerUser, transactionId: transaction._id, claimedAt: new Date() });
    
    // Emit real-time
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('balance:update', { balance: user.balance });
      io.of('/chat').to(`room:${roomId}`).emit('chat:rainReceived', { userId, amount: amountPerUser });
    }
  }
  
  rain.status = 'completed';
  rain.completedAt = new Date();
  await rain.save({ session });
  
  // Update room stats
  const updatedRoom = await ChatRoom.findById(roomId).session(session);
  updatedRoom.stats.totalRainAmount += totalAmount;
  updatedRoom.stats.totalRainCount += 1;
  await updatedRoom.save({ session });
  
  // Emit rain announcement
  const ioInstance = getIO();
  if (ioInstance) {
    ioInstance.of('/chat').to(`room:${roomId}`).emit('chat:rain', { rainId: rain._id, totalAmount, recipients: rain.recipients.length });
  }
  
  return rain;
}

/**
 * Tips (Bahşiş)
 */

export async function sendTip(fromUserId, toUserId, roomId, amount, message, options = {}) {
  const { session = null } = options;
  
  // String karşılaştırması: fromUserId socket üzerinden JWT'den (düz string)
  // gelebilir, ObjectId.equals() gibi bir metodu olmayabilir — toUserId ise
  // her iki kaynaktan da (string veya ObjectId) gelebilir, String() ile normalize edilir.
  if (String(fromUserId) === String(toUserId)) throw createError(400, 'SELF_TIP', 'Kendinize bahşiş gönderemezsiniz');
  
  const room = await ChatRoom.findById(roomId).session(session);
  if (!room) throw createError(404, 'NOT_FOUND', 'Oda bulunamadı');
  
  // Atomic $gte+$inc (routes/inhouse.js deseni): bakiye kontrolü ve düşüş
  // tek operasyonda — iki eşzamanlı bahşişin ikisinin de yetersiz bakiyeyi
  // "yeterli" görme riskini (read-modify-write race condition) ortadan kaldırır.
  const fromUser = await User.findOneAndUpdate(
    { _id: fromUserId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { session, new: true },
  );
  if (!fromUser) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');

  const toUser = await User.findById(toUserId).session(session);
  if (!toUser) throw createError(404, 'RECIPIENT_NOT_FOUND', 'Alıcı bulunamadı');

  // Create from transaction (outgoing)
  const fromBalanceBefore = parseFloat((fromUser.balance + amount).toFixed(2));
  const tipId = `tip_${fromUserId}_${toUserId}_${Date.now()}`;

  const { transaction: fromTransaction } = await createTransaction({
    userId: fromUserId,
    type: 'tip_sent',
    amount: -amount,
    balanceBefore: fromBalanceBefore,
    balanceAfter: fromUser.balance,
    idempotencyKey: `${tipId}_sent`,
    source: 'player',
    metadata: { roomId, recipientUsername: toUser.username },
    relatedTransactionId: null,
  }, { session });
  
  // Create to transaction (incoming) — atomic $inc, tutarlılık için aynı desen.
  const updatedToUser = await User.findOneAndUpdate(
    { _id: toUserId },
    { $inc: { balance: amount } },
    { session, new: true },
  );
  const toBalanceBefore = parseFloat((updatedToUser.balance - amount).toFixed(2));
  toUser.balance = updatedToUser.balance;

  const { transaction: toTransaction } = await createTransaction({
    userId: toUserId,
    type: 'tip_received',
    amount,
    balanceBefore: toBalanceBefore,
    balanceAfter: toUser.balance,
    idempotencyKey: `${tipId}_received`,
    source: 'player',
    metadata: { roomId, senderUsername: fromUser.username },
    relatedTransactionId: fromTransaction._id,
  }, { session });
  
  // Create tip record
  const tip = await ChatTip.create([{
    roomId,
    fromUserId,
    toUserId,
    amount,
    message,
    fromTransactionId: fromTransaction._id,
    toTransactionId: toTransaction._id,
    status: 'completed',
  }], { session });
  
  // Emit real-time
  const ioInstance = getIO();
  if (ioInstance) {
    ioInstance.to(`user:${fromUserId}`).emit('balance:update', { balance: fromUser.balance });
    ioInstance.to(`user:${toUserId}`).emit('balance:update', { balance: toUser.balance });
    ioInstance.of('/chat').to(`room:${roomId}`).emit('chat:tip', { 
      tipId: tip[0]._id, 
      fromUser: fromUser.username, 
      toUser: toUser.username, 
      amount, 
      message 
    });
  }
  
  // Send tip notification message to chat
  await sendMessage(fromUserId, roomId, `💸 ${toUser.username} kullanıcısına ${amount} bahşiş gönderdi${message ? ': ' + message : ''}`, 'tip', { metadata: { tipId: tip[0]._id } });
  
  return tip[0];
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

export function initChatSocket(io) {
  const chatNS = io.of('/chat');
  
  chatNS.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('auth'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('auth'));
    }
  });
  
  chatNS.on('connection', (socket) => {
    socket.on('chat:join', ({ roomId }) => {
      socket.join(`room:${roomId}`);
    });
    
    socket.on('chat:leave', ({ roomId }) => {
      socket.leave(`room:${roomId}`);
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
        await deleteMessage(messageId, socket.user.id);
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
    
    socket.on('chat:tip', async ({ roomId, toUserId, amount, message }) => {
      try {
        await sendTip(socket.user.id, toUserId, roomId, amount, message);
        socket.emit('chat:tipSent', { toUserId, amount });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('chat:rain', async ({ roomId, totalAmount }) => {
      try {
        const rain = await createRain(roomId, socket.user.id, { totalAmount });
        socket.emit('chat:rainCreated', { rainId: rain._id });
      } catch (e) {
        socket.emit('chat:error', { message: e.message });
      }
    });
    
    socket.on('disconnect', () => {
      // Cleanup
    });
  });
}