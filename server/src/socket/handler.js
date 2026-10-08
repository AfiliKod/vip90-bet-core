import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { subscribeToGameStream, unsubscribeFromGameStream, initializeGameStream, getRecentWinners } from '../services/liveGameStream.js';
import { initChatSocket } from '../services/chat.js';
import { broadcastOnlineCount, getOnlineCount } from '../services/onlineCount.js';

function verifySocketToken(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function initSocket(io) {
  // Ana namespace — mevcut event/user subscription'ları
  io.on('connection', (socket) => {
    // Çevrimiçi sayaç artık polling DEĞİL, push: yeni bağlanan socket'a anında
    // güncel sayı gönderilir, bağlantı/kopuş herkese yayınlanır (bkz.
    // services/onlineCount.js — WinnersPanel.jsx'in "Tümü" yerine gösterdiği
    // sayaç, useOnlineCount.js). Havuz periyodik yeniden zarlandığında da
    // (fakeWinners.js regeneratePool) ayrıca yayınlanıyor.
    socket.emit('online:count', { count: getOnlineCount() });
    broadcastOnlineCount();
    socket.on('disconnect', broadcastOnlineCount);

    socket.on('subscribe:event', ({ eventId }) => socket.join(`event:${eventId}`));
    socket.on('unsubscribe:event', ({ eventId }) => socket.leave(`event:${eventId}`));

    // Kişisel ve admin odaları yalnızca geçerli bir access token'ın sahibine
    // açılır. Eskiden sunucu istemcinin GÖNDERDİĞİ userId'ye güveniyordu:
    // ana namespace'te kimlik doğrulaması olmadığından, bir admin'in id'sini
    // bilen herkes 'role:admin' odasına katılıp tüm yatırma/çekme ve KYC
    // olaylarını (kullanıcı adı + tutarla), herhangi bir oyuncunun id'siyle
    // de onun bakiye olaylarını dinleyebiliyordu (2026-10-03 denetimi).
    socket.on('subscribe:user', ({ token } = {}) => {
      const payload = verifySocketToken(token);
      if (payload?.id) socket.join(`user:${payload.id}`);
    });
    socket.on('unsubscribe:user', ({ userId } = {}) => {
      if (userId) socket.leave(`user:${userId}`);
    });

    // Ticket/KYC/aktivite gibi admin-only bildirimler. Rol, token'daki
    // kimlik üzerinden DB'den doğrulanır (client'ın beyanına güvenilmez).
    socket.on('subscribe:admin', async ({ token } = {}) => {
      const payload = verifySocketToken(token);
      if (!payload?.id) return;
      try {
        const user = await User.findById(payload.id).select('role isSeed').lean();
        if (user?.role === 'admin' && !user.isSeed) socket.join('role:admin');
      } catch { /* geçersiz id vb. — sessizce yok say */ }
    });
  });

  // /live namespace — Canlı oyun akışı ve son kazananlar
  const liveNS = io.of('/live');

  liveNS.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('auth'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('auth'));
    }
  });

  liveNS.on('connection', (socket) => {
    // Subscribe to game stream
    socket.on('live:subscribe', ({ gameId }) => {
      if (!gameId) return;
      initializeGameStream(gameId);
      socket.join(`game:${gameId}`);
      subscribeToGameStream(socket.id, gameId);

      // Send recent winners
      socket.emit('live:recentWinners', getRecentWinners());
    });

    // Unsubscribe from game stream
    socket.on('live:unsubscribe', ({ gameId }) => {
      if (!gameId) return;
      socket.leave(`game:${gameId}`);
      unsubscribeFromGameStream(socket.id, gameId);
    });

    socket.on('disconnect', () => {
      // Cleanup handled by subscribe/unsubscribe
    });
  });

  // /chat namespace — Sohbet, yağmur, bahşiş
  initChatSocket(io);

  // Initialize default game streams
  initializeGameStream('inhouse-crash');
  initializeGameStream('inhouse-roulette');
}
