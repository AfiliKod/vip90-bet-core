/**
 * U5 — Tarih, saat dilimi ve sayı biçimlendirme çekirdeği.
 *
 * U1'in (core.js) deseni: framework'ten bağımsız saf fonksiyonlar,
 * DOM'a bağımlı değil, node --test ile test edilir. React sargısı
 * (useFormatters) locale'i I18nProvider'dan, saat dilimini operatör
 * ayarından alıp buraya enjekte eder.
 *
 * Sunucu tarihleri UTC saklar; saat dilimi burada, render anında uygulanır.
 * Para birimi biçimlendirme BU KAPSAMDA DEĞİLDİR (U4) — yalnızca genel
 * sayı/yüzde formatlayıcıları vardır.
 */

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

const INVALID = '—';

function toDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object} opts
 * @param {string} opts.locale   — I18nProvider'ın aktif dili ('tr', 'en', …)
 * @param {string} opts.timezone — operatörün seçtiği IANA bölgesi
 */
export function createFormatters({ locale = 'tr', timezone = DEFAULT_TIMEZONE }) {
  // Geçersiz bölge adı Intl.RangeError fırlatır — kurulumda yakala, güvenli
  // varsayılana düş (yanlış panel girişi tüm sayfayı kırmamalı).
  let tz = timezone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    tz = DEFAULT_TIMEZONE;
  }

  function dt(options) {
    return new Intl.DateTimeFormat(locale, { timeZone: tz, ...options });
  }

  return {
    /** '21:30' — operatörün saat diliminde. */
    formatTime(value) {
      const d = toDate(value);
      if (!d) return INVALID;
      return dt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    },

    /** '15 Mar' — operatörün saat dilimindeki takvim günü. */
    formatDate(value) {
      const d = toDate(value);
      if (!d) return INVALID;
      return dt({ day: '2-digit', month: 'short' }).format(d);
    },

    /** '15 Mar, 21:30' */
    formatDateTime(value) {
      const d = toDate(value);
      if (!d) return INVALID;
      return dt({ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    },

    /** Genel sayılar (XP, oyun sayısı vb.) — para birimi DEĞİL (U4'ün alanı). */
    formatNumber(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return INVALID;
      return new Intl.NumberFormat(locale).format(n);
    },

    /** 0.975 → '%97,5' (tr) / '97.5%' (en) */
    formatPercent(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return INVALID;
      return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n);
    },
  };
}
