/**
 * Para birimi biçimlendirme (U4).
 *
 * Aktif para birimi sunucudan (`GET /api/currency`) çekilip modül-seviyesi
 * bir değişkende önbelleklenir — `ThemeStyleInjector`'ın CSS var enjeksiyonuna
 * benzer bir "uygulama açılışında bir kez getir" deseni, ama burada React
 * state değil, `formatMoney`'in senkron okuyabileceği düz bir değer.
 *
 * Sunucudan hiç veri gelmeden önce (ya da fetch başarısız olursa) varsayılan
 * TRY ile devam eder — hiçbir çağrı throw etmez.
 */

const DEFAULT_CURRENCY = { code: 'TRY', symbol: '₺', locale: 'tr-TR' };

let activeCurrency = DEFAULT_CURRENCY;

export function setActiveCurrency(currency) {
  if (!currency?.code || !currency?.locale) return;
  activeCurrency = currency;
}

export function getActiveCurrency() {
  return activeCurrency;
}

export function resetActiveCurrency() {
  activeCurrency = DEFAULT_CURRENCY;
}

export function formatMoney(amount, currency = activeCurrency) {
  const n = Number(amount);
  const safeAmount = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${currency.symbol}${safeAmount.toFixed(2)}`;
  }
}
