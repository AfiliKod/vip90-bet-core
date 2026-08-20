/**
 * i18n çekirdeği (U1 — Faz 0 sözleşmesi).
 *
 * Framework'ten bağımsız, saf çeviri mantığı. `useTranslation` hook'u ve
 * `I18nProvider` bunu React'e bağlayan ince bir sargıdan ibarettir; asıl
 * mantık — arama, interpolasyon, fallback, anahtar doğrulama — burada
 * yaşar ve DOM/React olmadan test edilir.
 *
 * Anahtar isimlendirme kuralı: nokta ayraçlı, en az iki segment
 * (`ad-alanı.anahtar`), her segment küçük harfle başlar, camelCase içerebilir.
 * Örnek: `auth.username`, `auth.login.title`, `auth.referralOptional`.
 */

const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

export function assertValidKey(key) {
  if (typeof key !== 'string' || !key.includes('.')) {
    throw new Error(`i18n anahtarı ad alanı içermeli (ör. "auth.username"): "${key}"`);
  }
  if (!KEY_RE.test(key)) {
    throw new Error(`i18n anahtarı kurala uymuyor (küçük harfle başlayan, nokta ayraçlı segmentler): "${key}"`);
  }
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export function createI18nCore({ dictionaries, defaultLocale, fallbackLocale = defaultLocale }) {
  if (!dictionaries[defaultLocale]) {
    throw new Error(`Tanımsız dil: "${defaultLocale}"`);
  }

  function lookup(locale, key) {
    return dictionaries[locale]?.[key];
  }

  return {
    locale: defaultLocale,

    t(key, params) {
      assertValidKey(key);
      const raw = lookup(defaultLocale, key) ?? lookup(fallbackLocale, key) ?? key;
      return interpolate(raw, params);
    },

    locales() {
      return Object.keys(dictionaries);
    },

    withLocale(locale) {
      if (!dictionaries[locale]) {
        throw new Error(`Tanımsız dil: "${locale}"`);
      }
      return createI18nCore({ dictionaries, defaultLocale: locale, fallbackLocale });
    },
  };
}
