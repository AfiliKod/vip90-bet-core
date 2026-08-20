import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { createI18nCore, dictionaries, DEFAULT_LOCALE } from './index.js';

const STORAGE_KEY = 'locale';
const I18nContext = createContext(null);

function readStoredLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return dictionaries[v] ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Uygulamanın kök seviyesinde bir kez mount edilir. Mantığın tamamı
 * (arama, interpolasyon, fallback, anahtar doğrulama) test edilmiş
 * `createI18nCore`'da yaşar — burası yalnızca React state/context sargısı.
 */
export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale);

  const core = useMemo(
    () => createI18nCore({ dictionaries, defaultLocale: locale, fallbackLocale: DEFAULT_LOCALE }),
    [locale],
  );

  const setLocale = useCallback((next) => {
    if (!dictionaries[next]) return;
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* localStorage yoksa sessizce geç */ }
  }, []);

  const value = useMemo(
    () => ({ t: core.t, locale, setLocale, locales: core.locales() }),
    [core, locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation, I18nProvider içinde kullanılmalı');
  return ctx;
}
