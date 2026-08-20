import jwt from 'jsonwebtoken';
import { startStream, handleInput, stopStream, spinGame } from '../services/streamService.js';
import { subscribeToGameStream, unsubscribeFromGameStream, initializeGameStream } from '../services/liveGameStream.js';

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

  // /stream namespace — oyun streaming (auth zorunlu)
  const streamNS = io.of('/stream');

  streamNS.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('auth'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('auth'));
    }
  });

  streamNS.on('connection', (socket) => {
    socket.on('stream:start', (data) => startStream(socket, data));
    socket.on('stream:input', (input) => handleInput(socket.id, input));
    socket.on('stream:spin', async () => {
      const result = await spinGame(socket.id);
      if (result) socket.emit('stream:spinResult', result);
    });
    socket.on('stream:stop', () => stopStream(socket.id));
    socket.on('disconnect', () => stopStream(socket.id));
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
      const { getRecentWinners } = require('../services/liveGameStream.js');
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

  // Initialize default game streams
  initializeGameStream('inhouse-crash');
  initializeGameStream('inhouse-roulette');
}
