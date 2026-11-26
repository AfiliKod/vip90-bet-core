/**
 * i18n sözlük kayıt noktası (U1).
 *
 * Only the default locale (tr, also the fallback) ships in the main bundle.
 * The other dictionaries are ~220 KB each and load on demand with
 * `loadLocale()`, so a visitor downloads one language, not eight.
 *
 * Yeni bir dil eklemek: dictionaries/ altına dosya + aşağıdaki LOADERS'a kayıt.
 * DEFAULT_LOCALE aynı zamanda fallbackLocale'dir — tr'de olmayan bir
 * anahtar hiçbir dilde bulunamaz demektir, çünkü tr eksiksiz tutulur.
 */
import tr from './dictionaries/tr.js';

export const DEFAULT_LOCALE = 'tr';

const LOADERS = {
  en: () => import('./dictionaries/en.js'),
  ko: () => import('./dictionaries/ko.js'),
  th: () => import('./dictionaries/th.js'),
  es: () => import('./dictionaries/es.js'),
  ja: () => import('./dictionaries/ja.js'),
  pt: () => import('./dictionaries/pt.js'),
  de: () => import('./dictionaries/de.js'),
};

/** Every supported locale, loaded or not (language switcher order). */
export const LOCALES = ['tr', 'en', 'ko', 'th', 'es', 'ja', 'pt', 'de'];

/** Loaded dictionaries only; `loadLocale()` adds to it. */
export const dictionaries = { tr };

export function isSupportedLocale(locale) {
  return LOCALES.includes(locale);
}

export const LOCALE_STORAGE_KEY = 'locale';

/** null = kullanıcı hiç dil seçmemiş (localStorage boş/geçersiz) — bu durumda
 * admin'in belirlediği site varsayılanı geçerli olmalı, sabit 'tr' DEĞİL. */
export function readStoredLocale() {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(v) ? v : null;
  } catch {
    return null;
  }
}

const pending = {};

/**
 * Loads a locale's dictionary once. Resolves to the locale code that is
 * usable: the requested one, or DEFAULT_LOCALE when it is unknown or its
 * chunk fails to load.
 */
export function loadLocale(locale) {
  if (dictionaries[locale]) return Promise.resolve(locale);
  if (!LOADERS[locale]) return Promise.resolve(DEFAULT_LOCALE);
  if (!pending[locale]) {
    pending[locale] = LOADERS[locale]()
      .then(mod => { dictionaries[locale] = mod.default; return locale; })
      .catch(() => { delete pending[locale]; return DEFAULT_LOCALE; });
  }
  return pending[locale];
}

/** Loads the stored locale's dictionary; main.jsx awaits it before rendering. */
export function preloadInitialLocale() {
  const stored = readStoredLocale();
  return stored ? loadLocale(stored) : Promise.resolve(DEFAULT_LOCALE);
}

export { createI18nCore, assertValidKey } from './core.js';
export { I18nProvider, useTranslation } from './I18nProvider.jsx';
