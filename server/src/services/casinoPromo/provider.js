// Aktif casino sağlayıcı servisine erişim. `_getIgamesService` test/mock için
// override edilebilir (igamesSession.js -> _setIgamesService).
export async function getIgames() {
  const sessionMod = await import('../../premium/igames/igamesSession.js');
  if (sessionMod._getIgamesService) return sessionMod._getIgamesService();
  return await import('../../premium/igames/igamesCasinoService.js');
}
