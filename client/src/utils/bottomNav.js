/**
 * BottomNav'ın hangi yollarda OLMADIĞI — tek kaynak.
 *
 * Ayrı bir modülde duruyor: component dosyasından component dışı export
 * yapmak Fast Refresh'i bozuyor (react-refresh/only-export-components).
 * ChatWidget'in yüzen butonu bu bilgiye bakıp nav görünüyorsa onun üstünde,
 * görünmüyorsa ekranın altında demirliyor.
 */
export function isBottomNavHidden(pathname) {
  return pathname.startsWith('/games/') || /^\/casino(-v2)?\/[^/]+/.test(pathname);
}
