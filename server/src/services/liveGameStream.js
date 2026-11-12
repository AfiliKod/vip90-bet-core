import crypto from 'node:crypto';
import { optionalTenantId, liveRoom } from '../tenancy/tenantKeys.js';
import { publishToRoom, publishToTenant } from '../socket/publish.js';

/**
 * Live Game Stream Service
 * Provides real-time updates for casino games
 */

// Store active game streams
const activeStreams = new Map(); // `${tenantKey}:${gameId}` -> { subscribers, lastUpdate }

// Store recent winners
const recentWinners = new Map(); // tenantKey -> entry[]
const MAX_WINNERS = 50;

function tenantKey(tenantId) {
  return optionalTenantId(tenantId) || 'g';
}

function streamKey(gameId, tenantId) {
  return `${tenantKey(tenantId)}:${gameId}`;
}

/**
 * Subscribe to a live game stream
 */
export function subscribeToGameStream(socketId, gameId, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  if (!activeStreams.has(key)) {
    activeStreams.set(key, { subscribers: new Set(), lastUpdate: Date.now() });
  }
  activeStreams.get(key).subscribers.add(socketId);
}

/**
 * Unsubscribe from a live game stream
 */
export function unsubscribeFromGameStream(socketId, gameId, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  const stream = activeStreams.get(key);
  if (stream) {
    stream.subscribers.delete(socketId);
    if (stream.subscribers.size === 0) {
      activeStreams.delete(key);
    }
  }
}

/**
 * Emit live game update to subscribers
 */
export function emitGameUpdate(gameId, update, tenantId = null) {
  const stream = activeStreams.get(streamKey(gameId, tenantId));
  if (stream && stream.subscribers.size > 0) {
    const id = optionalTenantId(tenantId);
    const room = id ? liveRoom(id, gameId) : `game:${gameId}`;
    publishToRoom(room, 'game:update', update, { namespace: '/live' });
    stream.lastUpdate = Date.now();
  }
}

/**
 * Emit live spin/round result
 */
export function emitSpinResult(gameId, result, tenantId = null) {
  const id = optionalTenantId(tenantId);
  const room = id ? liveRoom(id, gameId) : `game:${gameId}`;
  publishToRoom(room, 'game:spinResult', result, { namespace: '/live' });
}

/** Public display mask: first 2 chars + `***`; empty/short -> `***`. */
export function maskUsername(username) {
  const clean = String(username || '').trim();
  if (clean.length < 3) return '***';
  return `${clean.slice(0, 2)}***`;
}

/**
 * Add a winner to the recent winners ticker. The entry is public (socket
 * broadcast + REST): never carries userId, username is always masked
 * (real and synthetic winners look identical).
 */
export function addRecentWinner(winner) {
  const id = winner.tenantId || optionalTenantId();
  const entry = {
    id: crypto.randomUUID(),
    username: maskUsername(winner.username),
    gameId: winner.gameId,
    gameTitle: winner.gameTitle,
    amount: winner.amount,
    currency: winner.currency || 'TRY',
    // Gerçek in-house kazananlarda yok (client winnerImage(gameId) ile
    // türetir); yalnızca Igames/casino fake-winners simülasyonu Igames'ın
    // gerçek CDN görselini buraya geçiyor (bkz. services/fakeWinners.js).
    image: winner.image || null,
    timestamp: Date.now(),
  };
  
  if (id) {
    const list = recentWinners.get(String(id)) || [];
    list.unshift(entry);
    if (list.length > MAX_WINNERS) list.pop();
    recentWinners.set(String(id), list);
    publishToTenant('winners:new', entry, { tenantId: id });
  } else {
    const list = recentWinners.get('g') || [];
    list.unshift(entry);
    if (list.length > MAX_WINNERS) list.pop();
    recentWinners.set('g', list);
    publishToTenant('winners:new', entry);
  }
  
  return entry;
}

/**
 * Get recent winners for ticker
 */
export function getRecentWinners(limit = 20, tenantId = null) {
  return (recentWinners.get(tenantKey(tenantId)) || []).slice(0, limit);
}

/**
 * Get active game streams info
 */
export function getActiveStreamsInfo(tenantId = null) {
  const prefix = `${tenantKey(tenantId)}:`;
  const info = {};
  for (const [key, stream] of activeStreams.entries()) {
    if (!key.startsWith(prefix)) continue;
    info[key.slice(prefix.length)] = {
      subscriberCount: stream.subscribers.size,
      lastUpdate: stream.lastUpdate,
    };
  }
  return info;
}

/**
 * Initialize live stream for a game
 */
export function initializeGameStream(gameId, tenantId = null) {
  const key = streamKey(gameId, tenantId);
  if (!activeStreams.has(key)) {
    activeStreams.set(key, { subscribers: new Set(), lastUpdate: Date.now() });
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
