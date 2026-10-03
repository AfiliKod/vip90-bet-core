import ActivityEvent from '../models/ActivityEvent.js';
import { getIO as _getIO } from './socketEmitter.js';

// slikairController.js'teki _setSlikairService deseniyle tutarlı — testlerin
// mock.method() ile mocklayamayacağı bir ESM namespace importu yerine
// settable bir seam kullanıyoruz (bkz. plan dosyasındaki "ÖNEMLİ" notu:
// `import * as x` module-namespace nesneleri non-configurable, mock.method
// "Cannot redefine property" ile patlar).
let _ioGetter = _getIO;
export function _setIOGetter(fn) { _ioGetter = fn; }
export function _getIOGetter() { return _ioGetter; }

// `summary` sunucuda sabit Türkçe üretiliyor ve DB'ye öyle yazılıyor — bu
// yüzden i18n ile GÖSTERİLEMEZ (denetim raporu bulgusu). Client
// (ActivityFeed.jsx renderSummary) artık bu ham metni DEĞİL, type+data'dan
// kendi ürettiği yerelleştirilmiş metni gösteriyor; `summary` audit/log
// amaçlı (ör. sunucu konsol logları, DB'yi doğrudan inceleme) hâlâ
// gerekli olduğu için korunuyor, ama YENİ bir summary türü eklerken
// mutlaka `data`ya da render için yeterli alanları ekle.
export async function logActivity({ type, userId, status, summary, amount = null, currency = null, data = {}, referenceId = null, referenceModel = null }) {
  try {
    const event = await ActivityEvent.create({ type, userId, status, summary, amount, currency, data, referenceId, referenceModel });
    try {
      const io = _ioGetter();
      if (io) {
        // userId'yi username ile populate ederek yayınlıyoruz — frontend'in
        // "Kullanıcıyı Görüntüle" linki mevcut /admin/users?search= endpoint'ini
        // (username ile arıyor, ID ile değil) yeniden kullanıyor; canlı push'ta
        // da REST'ten ilk yüklemede olduğu gibi username hazır olmalı (bkz.
        // Task 10'daki .populate('userId','username') ve Task 11).
        const populated = await event.populate('userId', 'username');
        io.to('role:admin').emit('activity:new', populated.toObject());
      }
    } catch (e) {
      console.error('[activityFeed] socket emit hatası:', e.message);
    }
    return event;
  } catch (e) {
    console.error('[activityFeed] logActivity hatası:', e.message);
    return null;
  }
}

const SESSION_GAP_MS = 10 * 60 * 1000;

export async function upsertGameSession({ userId, gameId, gameTitle, bet, net }) {
  try {
    const cutoff = new Date(Date.now() - SESSION_GAP_MS);
    const existing = await ActivityEvent.findOne({
      userId, type: 'game_session', status: 'active', updatedAt: { $gte: cutoff },
    }).sort({ updatedAt: -1 });

    if (existing) {
      existing.data.roundCount = (existing.data.roundCount || 0) + 1;
      existing.data.totalBet = (existing.data.totalBet || 0) + bet;
      existing.data.totalNet = (existing.data.totalNet || 0) + net;
      const sessionGameTitle = existing.data.gameTitle ?? gameTitle;
      existing.summary = `${sessionGameTitle} — ${existing.data.roundCount} tur, ${existing.data.totalBet}₺ bahis`;
      existing.markModified('data');
      await existing.save();
      try {
        const io = _ioGetter();
        if (io) {
          const populated = await existing.populate('userId', 'username');
          io.to('role:admin').emit('activity:update', populated.toObject());
        }
      } catch (e) {
        console.error('[activityFeed] socket emit hatası:', e.message);
      }
      return;
    }

    await logActivity({
      type: 'game_session',
      userId,
      status: 'active',
      summary: `${gameTitle} — 1 tur, ${bet}₺ bahis`,
      data: { gameId, gameTitle, roundCount: 1, totalBet: bet, totalNet: net, startedAt: new Date() },
    });
  } catch (e) {
    console.error('[activityFeed] upsertGameSession hatası:', e.message);
  }
}
