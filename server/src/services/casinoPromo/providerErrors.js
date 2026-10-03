// Sağlayıcı (Palace agent API) hata eşlemesi — bkz. spec "Servis katmanı".
//
// Sağlayıcı üç farklı biçimde hata bildirebilir:
//  (a) HTTP 200 + { code != 0, message } (apiRequest sonucu, result.data.code)
//  (b) Error nesnesi, message bir kod ADI ("PERMISSION_ERROR") ya da serbest metin
//  (c) Error nesnesi, message sayısal bir kod içeriyor (ör. "Igames API error 2005: ...")
//
// Kaynak: docs/superpowers/specs/2026-09-30-casino-promo-grants-design.md
// (sağlayıcının yanıt kodları tablosu).

const CODE_TABLE = {
  0: { code: 'PROMO_OK', httpStatus: 200, name: 'OK' },
  1: { code: 'PROMO_PROVIDER_BUSY', httpStatus: 503, name: 'UNDER_MAINTENANCE' },
  1001: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'INTERNAL_SERVER_ERROR' },
  1002: { code: 'PROMO_INVALID_PARAMS', httpStatus: 400, name: 'VALIDATION_ERROR' },
  1003: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'SERVICE_EXCEPTION' },
  1007: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'TOKEN_NOT_FOUND' },
  1009: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'TOKEN_INVALID' },
  1010: { code: 'PROMO_PERMISSION_DISABLED', httpStatus: 403, name: 'PERMISSION_ERROR' },
  1011: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'PROVIDER_ERROR' },
  1012: { code: 'PROMO_INVALID_PARAMS', httpStatus: 400, name: 'PARAMETERS_INVALID' },
  1015: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'CALLBACK_ERROR' },
  1018: { code: 'PROMO_PROVIDER_BUSY', httpStatus: 503, name: 'SERVER_IS_BUSY' },
  1020: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'IP_NOT_ALLOWED' },
  2001: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'AGENT_NOT_FOUND' },
  2002: { code: 'PROMO_USER_NOT_FOUND', httpStatus: 404, name: 'USER_NOT_FOUND' },
  2003: { code: 'PROMO_GAME_NOT_FOUND', httpStatus: 404, name: 'GAME_NOT_FOUND' },
  2005: { code: 'PROMO_AGENT_BALANCE_LOW', httpStatus: 402, name: 'POINT_NOT_ENOUGH' },
  2006: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'BALANCE_NOT_ENOUGH' },
  2007: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'PROVIDER_NOT_FOUND' },
  2011: { code: 'PROMO_CALL_DUPLICATE', httpStatus: 409, name: 'BONUSCALL_DOUBLE' },
  2012: { code: 'PROMO_CALL_ENDED', httpStatus: 409, name: 'BONUSCALL_ALEADY_ENDED' },
  2013: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'ROUND_NOT_FOUND' },
  2014: { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: 'CURRENCY_NOT_SUPPORTED' },
};

// Kod adı → sayısal kod (Error.message içinde ad geçiyorsa eşlemek için).
// En uzun adlar önce denenir (substring çakışmalarını önlemek için).
const NAME_ENTRIES = Object.entries(CODE_TABLE)
  .filter(([num]) => Number(num) !== 0)
  .map(([num, entry]) => [entry.name, Number(num)])
  .sort((a, b) => b[0].length - a[0].length);

function buildFromCode(providerCode, rawMessage) {
  const entry = CODE_TABLE[providerCode] || { code: 'PROMO_PROVIDER_ERROR', httpStatus: 502, name: null };
  return {
    code: entry.code,
    message: rawMessage || entry.name || 'Sağlayıcı hatası',
    httpStatus: entry.httpStatus,
    providerCode,
  };
}

function buildUnknown(rawMessage) {
  return { code: 'PROMO_PROVIDER_ERROR', message: rawMessage || 'Sağlayıcı hatası', httpStatus: 502, providerCode: null };
}

/** Sağlayıcı yanıtı "başarılı" mı? (result.data.code === 0, ya da code alanı hiç yoksa data varlığı yeterli). */
export function isProviderOk(result) {
  const data = result?.data;
  if (data == null || typeof data !== 'object') return false;
  if ('code' in data) return data.code === 0;
  return true;
}

/**
 * Girdi üç biçimde olabilir (bkz. dosya başı). Her zaman { code, message, httpStatus, providerCode } döner.
 */
export function toPromoError(errOrResult) {
  // (a) apiRequest sonucu: { status, data: { code, message } }
  const data = errOrResult?.data;
  if (data && typeof data === 'object' && typeof data.code === 'number') {
    return buildFromCode(data.code, data.message);
  }

  const message = typeof errOrResult?.message === 'string'
    ? errOrResult.message
    : (typeof errOrResult === 'string' ? errOrResult : '');

  // (b) mesajda kod adı geçiyor mu?
  const upper = message.toUpperCase();
  for (const [name, code] of NAME_ENTRIES) {
    if (upper.includes(name)) return buildFromCode(code, message);
  }

  // (c) mesajda bilinen sayısal bir kod geçiyor mu?
  const numbers = message.match(/\d{1,4}/g) || [];
  for (const numStr of numbers) {
    const num = Number(numStr);
    if (num !== 0 && CODE_TABLE[num]) return buildFromCode(num, message);
  }

  return buildUnknown(message);
}
