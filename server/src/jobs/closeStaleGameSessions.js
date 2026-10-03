import ActivityEvent from '../models/ActivityEvent.js';
import { getIO as _getIO } from '../services/socketEmitter.js';

// activityFeed.js'teki _setIOGetter deseniyle tutarlı — ESM namespace importu
// (import * as) non-configurable olduğu için mock.method ile mocklanamaz
// (bkz. activityFeed.test.js / task-2-report.md notu). Bu modül ayrı bir
// dosya olduğu için kendi yerel seam'ini tutar (paylaşılan değil;
// slikairController.js'teki desen).
let _ioGetter = _getIO;
export function _setIOGetter(fn) { _ioGetter = fn; }
export function _getIOGetter() { return _ioGetter; }

const SESSION_GAP_MS = 10 * 60 * 1000;

export async function closeStaleGameSessions() {
  const cutoff = new Date(Date.now() - SESSION_GAP_MS);
  const stale = await ActivityEvent.find({ type: 'game_session', status: 'active', updatedAt: { $lt: cutoff } });

  for (const ev of stale) {
    ev.status = 'ended';
    await ev.save();
    try {
      const io = _ioGetter();
      if (io) {
        const populated = await ev.populate('userId', 'username');
        io.to('role:admin').emit('activity:update', populated.toObject());
      }
    } catch (e) {
      console.error('[closeStaleGameSessions] socket emit hatası:', e.message);
    }
  }

  return stale.length;
}

export function startCloseStaleGameSessionsJob() {
  const INTERVAL = 2 * 60 * 1000; // 2 dakikada bir
  async function run() {
    try {
      const closed = await closeStaleGameSessions();
      if (closed > 0) console.log(`[closeStaleGameSessions] ${closed} oturum kapatıldı`);
    } catch (e) {
      console.error('[closeStaleGameSessions] error:', e.message);
    }
  }
  run();
  setInterval(run, INTERVAL);
}
