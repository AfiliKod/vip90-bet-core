import jwt from 'jsonwebtoken';
import { subscribeToGameStream, unsubscribeFromGameStream, initializeGameStream, getRecentWinners } from '../services/liveGameStream.js';
import { initChatSocket } from '../services/chat.js';

export function initSocket(io) {
  // Ana namespace — mevcut event/user subscription'ları
  io.on('connection', (socket) => {
    socket.on('subscribe:event', ({ eventId }) => socket.join(`event:${eventId}`));
    socket.on('unsubscribe:event', ({ eventId }) => socket.leave(`event:${eventId}`));

    socket.on('subscribe:user', ({ userId }) => {
      if (userId) socket.join(`user:${userId}`);
    });
    socket.on('unsubscribe:user', ({ userId }) => {
      if (userId) socket.leave(`user:${userId}`);
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
