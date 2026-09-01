import { getIO } from './socketEmitter.js';
import { getPoolSize } from './fakeWinners.js';

/**
 * "Çevrimiçi kullanıcı" sayısı = gerçek socket bağlantı sayısı + anlık
 * fake-winners oyuncu havuzu büyüklüğü (bkz. fakeWinners.js, WinnersPanel.jsx).
 *
 * Eskiden client 10sn'de bir GET /api/health/status'a polling yapıyordu —
 * sitede zaten açık bir socket bağlantısı varken (winners:new, canlı oranlar
 * vb. için) bu gereksiz tekrarlı HTTP trafiğiydi. Artık sayı yalnızca
 * GERÇEKTEN DEĞİŞTİĞİNDE (bir socket bağlanıp/koptuğunda ya da havuz
 * yeniden zarlandığında) tüm bağlı client'lara PUSH ediliyor — bkz.
 * socket/handler.js (connect/disconnect) ve fakeWinners.js (regeneratePool).
 * `GET /api/health/status` hâlâ duruyor: guest kullanıcılar (socket bağlı
 * olmayabilir) ve ilk yükleme için tek seferlik bir başlangıç değeri sağlıyor.
 */
export function getOnlineCount() {
  const io = getIO();
  const realOnline = io?.engine.clientsCount ?? 0;
  return realOnline + getPoolSize();
}

export function broadcastOnlineCount() {
  const io = getIO();
  if (!io) return;
  io.emit('online:count', { count: getOnlineCount() });
}
