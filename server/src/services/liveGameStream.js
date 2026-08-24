import { getIO } from './socketEmitter.js';

/**
 * Live Game Stream Service
 * Provides real-time updates for casino games
 */

// Store active game streams
const activeStreams = new Map(); // gameId -> { subscribers: Set<socketId>, lastUpdate: number }

// Store recent winners
const recentWinners = []; // Array of { userId, username, gameId, gameTitle, amount, currency, timestamp }
const MAX_WINNERS = 50;

/**
 * Subscribe to a live game stream
 */
export function subscribeToGameStream(socketId, gameId) {
  if (!activeStreams.has(gameId)) {
    activeStreams.set(gameId, { subscribers: new Set(), lastUpdate: Date.now() });
  }
  activeStreams.get(gameId).subscribers.add(socketId);
}

/**
 * Unsubscribe from a live game stream
 */
export function unsubscribeFromGameStream(socketId, gameId) {
  const stream = activeStreams.get(gameId);
  if (stream) {
    stream.subscribers.delete(socketId);
    if (stream.subscribers.size === 0) {
      activeStreams.delete(gameId);
    }
  }
}

/**
 * Emit live game update to subscribers
 */
export function emitGameUpdate(gameId, update) {
  const stream = activeStreams.get(gameId);
  if (stream && stream.subscribers.size > 0) {
    const io = getIO();
    if (io) {
      // DÜZELTME: socket/handler.js ve client'ın bağlandığı namespace '/live'
      // — burası önceden '/stream' idi (hiç kimsenin bağlı olmadığı, ölü bir
      // namespace), bu yüzden bu event hiçbir zaman kimseye ulaşmıyordu.
      io.of('/live').to(`game:${gameId}`).emit('game:update', update);
      stream.lastUpdate = Date.now();
    }
  }
}

/**
 * Emit live spin/round result
 */
export function emitSpinResult(gameId, result) {
  const io = getIO();
  if (io) {
    io.of('/live').to(`game:${gameId}`).emit('game:spinResult', result);
  }
}

/**
 * Add a winner to the recent winners ticker
 */
export function addRecentWinner(winner) {
  const entry = {
    userId: winner.userId,
    username: winner.username,
    gameId: winner.gameId,
    gameTitle: winner.gameTitle,
    amount: winner.amount,
    currency: winner.currency || 'TRY',
    timestamp: Date.now(),
  };
  
  recentWinners.unshift(entry);
  if (recentWinners.length > MAX_WINNERS) {
    recentWinners.pop();
  }
  
  // Emit to all connected clients
  const io = getIO();
  if (io) {
    io.emit('winners:new', entry);
  }
  
  return entry;
}

/**
 * Get recent winners for ticker
 */
export function getRecentWinners(limit = 20) {
  return recentWinners.slice(0, limit);
}

/**
 * Get active game streams info
 */
export function getActiveStreamsInfo() {
  const info = {};
  for (const [gameId, stream] of activeStreams.entries()) {
    info[gameId] = {
      subscriberCount: stream.subscribers.size,
      lastUpdate: stream.lastUpdate,
    };
  }
  return info;
}

/**
 * Initialize live stream for a game
 */
export function initializeGameStream(gameId) {
  if (!activeStreams.has(gameId)) {
    activeStreams.set(gameId, { subscribers: new Set(), lastUpdate: Date.now() });
  }
}

/**
 * Remove inactive streams (cleanup)
 */
export function cleanupInactiveStreams(maxAgeMs = 30 * 60 * 1000) { // 30 minutes
  const now = Date.now();
  for (const [gameId, stream] of activeStreams.entries()) {
    if (now - stream.lastUpdate > maxAgeMs && stream.subscribers.size === 0) {
      activeStreams.delete(gameId);
    }
  }
}

// Periodic cleanup — .unref() ile process'in kapanmasını engellemiyor
// (bu satır önceden unref'siz kaydedilmişti; bu modül hiç import edilmediği
// için o zamana dek fark edilmemişti — routes/inhouse.js'in artık onu
// import etmesiyle test process'lerinin hiç sonlanmaması sorununa yol açtı).
setInterval(cleanupInactiveStreams, 5 * 60 * 1000).unref(); // Every 5 minutes