/**
 * Para birimi sistemi (U4).
 *
 * Site genelinde tek bir aktif para birimi vardır (operatör panelden seçer).
 * `theme/registry.js` ve `modules/registry.js` ile aynı DI deseni: saf store
 * + injected `load`, DB erişilemezse/bozuk değer varsa sessizce varsayılana
 * (TRY) düşer — asla throw etmez.
 */

export const CURRENCY_DEFINITIONS = [
  { code: 'TRY', symbol: '₺', locale: 'tr-TR' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
];

export const DEFAULT_CURRENCY_CODE = 'TRY';

const TTL_MS = 30 * 1000;

function findDefinition(code) {
  return CURRENCY_DEFINITIONS.find(c => c.code === code);
}

/** Sunucu tarafında (ör. hata mesajları, log satırları) para tutarı biçimlendirir. */
export function formatMoney(amount, currency) {
  const n = Number(amount);
  const safeAmount = Number.isFinite(n) ? n : 0;
  return `${currency.symbol}${safeAmount.toFixed(2)}`;
}

export function createCurrencyStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = {}; // DB okunamıyor — varsayılan para birimiyle ayakta kal
    }
    loadedAt = now();
    return cache;
  }

  return {
    async getActive() {
      const override = await snapshot();
      const def = override.code && findDefinition(override.code);
      return def ?? findDefinition(DEFAULT_CURRENCY_CODE);
    },

    list() {
      return CURRENCY_DEFINITIONS;
    },

    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}
