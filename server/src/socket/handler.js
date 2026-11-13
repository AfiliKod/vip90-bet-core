import { adminIpAllowedForSocket } from '../middleware/adminIpAllowlist.js';
import User from '../models/User.js';
import { staffHasPermission, userHasPermission } from '../services/permissions.js';
import { subscribeToGameStream, unsubscribeFromGameStream, initializeGameStream, getRecentWinners } from '../services/liveGameStream.js';
import { verifySocketStaff, verifySocketUser, socketAuthMiddleware } from '../services/socketAuth.js';
import { initChatSocket } from '../services/chat.js';
import { broadcastOnlineCount, getOnlineCount } from '../services/onlineCount.js';
import { adminRoom, clientsRoom, liveRoom } from '../tenancy/tenantKeys.js';
import { getTenancyMode } from '../config/tenancy.js';
import { createSocketTenantResolver, socketPacketTenant, socketTenantMiddleware } from './tenant.js';

export function initSocket(io, { resolveSocketTenant = createSocketTenantResolver() } = {}) {
  // Ana namespace — mevcut event/user subscription'ları
  io.use(socketTenantMiddleware(resolveSocketTenant));

  io.on('connection', (socket) => {
    socket.use((_event, next) => socketPacketTenant(socket, next));
    const tenantId = socket.data.tenantId;
    // null = single mode before the default tenant exists: no tenant room, clients
    // receive today's global broadcasts.
    const clients = clientsRoom(tenantId);
    if (clients) socket.join(clients);
    // Çevrimiçi sayaç artık polling DEĞİL, push: yeni bağlanan socket'a anında
    // güncel sayı gönderilir, bağlantı/kopuş herkese yayınlanır (bkz.
    // services/onlineCount.js — WinnersPanel.jsx'in "Tümü" yerine gösterdiği
    // sayaç, useOnlineCount.js). Havuz periyodik yeniden zarlandığında da
    // (fakeWinners.js regeneratePool) ayrıca yayınlanıyor.
    socket.emit('online:count', { count: getOnlineCount(tenantId) });
    broadcastOnlineCount(tenantId);
    socket.on('disconnect', () => broadcastOnlineCount(tenantId));

    socket.on('subscribe:event', ({ eventId }) => socket.join(`event:${eventId}`));
    socket.on('unsubscribe:event', ({ eventId }) => socket.leave(`event:${eventId}`));

    // Kişisel ve admin odaları yalnızca geçerli bir access token'ın sahibine
    // açılır. Eskiden sunucu istemcinin GÖNDERDİĞİ userId'ye güveniyordu:
    // ana namespace'te kimlik doğrulaması olmadığından, bir admin'in id'sini
    // bilen herkes yönetici odasına katılıp tüm yatırma/çekme ve KYC
    // olaylarını (kullanıcı adı + tutarla), herhangi bir oyuncunun id'siyle
    // de onun bakiye olaylarını dinleyebiliyordu (2026-10-03 denetimi).
    socket.on('subscribe:user', async ({ token } = {}) => {
      const payload = await verifySocketUser(token);
      const sameTenant = !payload?.tid || String(payload.tid) === String(socket.data?.tenantId);
      if (payload?.id && sameTenant) socket.join(`user:${payload.id}`);
    });
    socket.on('unsubscribe:user', ({ userId } = {}) => {
      if (userId) socket.leave(`user:${userId}`);
    });

    // Ticket/KYC/aktivite gibi admin-only bildirimler. Rol, token'daki
    // kimlik üzerinden DB'den doğrulanır (client'ın beyanına güvenilmez).
    socket.on('subscribe:admin', async ({ token } = {}) => {
      // Single mode before the default tenant exists (G1 not run): the socket is
      // unbound and admins join the legacy admin room, exactly as before İP-7.
      const targetTenant = socket.data?.tenantId ?? null;
      if (!targetTenant && getTenancyMode() !== 'single') return;
      const staff = await verifySocketStaff(token);
      if (staff) {
        const tenantScopedStaff = staff.scp === 'tenant' && String(staff.sid) === String(targetTenant);
        if (
          tenantScopedStaff
          && adminIpAllowedForSocket(socket)
          && await staffHasPermission(staff.sub, 'admin:activity:read', {
            scopeType: 'tenant', scopeId: targetTenant,
          })
        ) {
          socket.join(adminRoom(targetTenant));
        }
        return;
      }
      const payload = await verifySocketUser(token);
      if (!payload?.id) return;
      try {
        const user = await User.findById(payload.id).select('role isSeed tenantId').lean();
        // V5: the room carries the activity feed, KYC/ticket events and queue
        // counts — same permission as GET /api/admin/activity, not just "staff".
        // V6: ADMIN_ALLOWED_IPS applies to the live admin room as well.
        const sameTenant = !user?.tenantId || String(user.tenantId) === String(targetTenant);
        if (user?.role === 'admin' && !user.isSeed && sameTenant && adminIpAllowedForSocket(socket) && await userHasPermission(payload.id, 'admin:activity:read')) {
          socket.join(adminRoom(targetTenant));
        }
      } catch { /* geçersiz id vb. — sessizce yok say */ }
    });
  });

  // /live namespace — Canlı oyun akışı ve son kazananlar
  const liveNS = io.of('/live');

  liveNS.use(socketTenantMiddleware(resolveSocketTenant));
  liveNS.use(socketAuthMiddleware);

  liveNS.on('connection', (socket) => {
    socket.use((_event, next) => socketPacketTenant(socket, next));
    // Subscribe to game stream
    socket.on('live:subscribe', ({ gameId }) => {
      if (!gameId) return;
      initializeGameStream(gameId, socket.data.tenantId);
      socket.join(liveRoom(socket.data.tenantId, gameId));
      subscribeToGameStream(socket.id, gameId, socket.data.tenantId);

      // Send recent winners
      socket.emit('live:recentWinners', getRecentWinners(20, socket.data.tenantId));
    });

    // Unsubscribe from game stream
    socket.on('live:unsubscribe', ({ gameId }) => {
      if (!gameId) return;
      socket.leave(liveRoom(socket.data.tenantId, gameId));
      unsubscribeFromGameStream(socket.id, gameId, socket.data.tenantId);
    });

    socket.on('disconnect', () => {
      // Cleanup handled by subscribe/unsubscribe
    });
  });

  // /chat namespace — Sohbet, yağmur, bahşiş
  initChatSocket(io, { resolveSocketTenant });
}
