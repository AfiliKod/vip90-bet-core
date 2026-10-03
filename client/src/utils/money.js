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
 *
 * Sayı biçimi (binlik/ondalık ayırıcı, sembol konumu) ayrıca aktif ARAYÜZ
 * diline göre de değişebilir — ör. İngilizce arayüzde TRY tutarı "₺1,000.00"
 * olarak görünmeli, "₺1.000,00" (tr-TR biçimi) değil. `setMoneyLocale`,
 * I18nProvider'ın locale değişimlerinde çağrılır (bkz. I18nProvider.jsx);
 * hiç çağrılmazsa (ör. testlerde) eski davranış — `currency.locale` — geçerli.
 */

const DEFAULT_CURRENCY = { code: 'TRY', symbol: '₺', locale: 'tr-TR' };

let activeCurrency = DEFAULT_CURRENCY;
let uiLocale = null;

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

/** Aktif arayüz dilini ('tr', 'en', …) kaydeder — formatMoney bundan sonra
 * para birimi kodunu/sembolünü koruyarak sayı biçimini bu dile göre üretir. */
export function setMoneyLocale(locale) {
  uiLocale = locale || null;
}

export function resetMoneyLocale() {
  uiLocale = null;
}

export function formatMoney(amount, currency = activeCurrency) {
  const n = Number(amount);
  const safeAmount = Number.isFinite(n) ? n : 0;
  const locale = uiLocale || currency.locale;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${currency.symbol}${safeAmount.toFixed(2)}`;
  }
}
