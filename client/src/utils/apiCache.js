// Basit, bellek-içi TTL cache — sayfa/component modülü seviyesinde tek bir
// `{ data, expiresAt }` nesnesiyle kullanılır (bkz. CasinoRedesign.jsx'teki
// orijinal desen). Sayfa yenilenince temizlenir, sessionStorage'a yazılmaz.
export const CACHE_TTL = 5 * 60 * 1000;

export function readCache(store) {
  return store && store.expiresAt > Date.now() ? store.data : null;
}

export function writeCache(store, data, ttl = CACHE_TTL) {
  store.data = data;
  store.expiresAt = Date.now() + ttl;
}
