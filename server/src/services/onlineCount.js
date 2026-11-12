import { getIO } from './socketEmitter.js';
import { getPoolSize } from './fakeWinners.js';
import { clientsRoom, optionalTenantId } from '../tenancy/tenantKeys.js';
import { publishToTenant } from '../socket/publish.js';

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
export function getOnlineCount(tenantId = null) {
  const io = getIO();
  const id = optionalTenantId(tenantId);
  const room = id ? clientsRoom(id) : null;
  const roomSize = room ? io?.sockets?.adapter?.rooms?.get(room)?.size : null;
  const realOnline = roomSize ?? io?.engine?.clientsCount ?? 0;
  return realOnline + getPoolSize(id);
}

export function broadcastOnlineCount(tenantId = null) {
  const io = getIO();
  if (!io) return;
  publishToTenant('online:count', { count: getOnlineCount(tenantId) }, { tenantId, io });
}
