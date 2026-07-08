// Single-flight refresh koordinatörü.
//
// Sunucu her /auth/refresh'te tokenVersion'ı rotate ediyor (refresh token reuse
// tespiti — güvenlik özelliği). Access token expire olunca aynı anda uçan birden
// fazla istek eşzamanlı 401 alır; her biri ayrı ayrı refresh denerse ilki
// tokenVersion'ı artırır, geri kalanlar eski cookie ile gidip "TOKEN_REVOKED" 401
// alır ve session geçerli olmasına rağmen kullanıcı spurious biçimde logout edilir.
//
// Bu koordinatör, uçuşta olan bir refresh varken gelen tüm çağrıların AYNI promise'i
// beklemesini sağlar — böylece rotasyon başına yalnızca bir refresh yapılır.

let inFlight = null;

export function coordinatedRefresh(refreshFn) {
  if (!inFlight) {
    inFlight = Promise.resolve()
      .then(refreshFn)
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

// Test yardımcısı — modül seviyesindeki in-flight durumunu sıfırlar.
export function _reset() { inFlight = null; }
