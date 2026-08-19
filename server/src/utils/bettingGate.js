/**
 * Bahis kapısı — oranlar bayatken kupon kabulünü durdurur.
 *
 * syncHealth alarm üretir ama alarm tek başına parayı korumaz: 2026-08-14'teki
 * 25 saatlik kesintide donmuş oranlarla bahis kabul edilmeye devam etmişti.
 * Bu modül o riski keser.
 *
 * Tasarım: docs/superpowers/specs/2026-08-14-sync-health-monitoring-design.md (§5)
 */
import { createError } from '../middleware/error.js';
import { isBettingBlocked } from '../services/syncHealth.js';

/** Etkinlik durumunu, oranlarını besleyen feed'e eşler. Bahse kapalı durumlar null. */
export function feedForEvent(status) {
  if (status === 'live') return 'live';
  if (status === 'upcoming') return 'upcomingOdds';
  return null;
}

/**
 * Etkinliğin feed'i bayatsa 503 FEED_STALE fırlatır. Kombine kuponda her seçim
 * için çağrılır — tek bir bayat seçim tüm kuponu reddeder (ODD_UNAVAILABLE ile tutarlı).
 */
export function assertFeedFresh(event, blocked = isBettingBlocked) {
  const feed = feedForEvent(event.status);
  if (feed && blocked(feed)) {
    throw createError(503, 'FEED_STALE', 'Oranlar güncellenemiyor, bahis geçici olarak kapalı');
  }
}
