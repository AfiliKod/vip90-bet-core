import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createI18nCore, dictionaries, DEFAULT_LOCALE } from './index.js';
import api from '../services/api';

const STORAGE_KEY = 'locale';
const I18nContext = createContext(null);

/** null = kullanıcı hiç dil seçmemiş (localStorage boş/geçersiz) — bu durumda
 * admin'in belirlediği site varsayılanı geçerli olmalı, sabit 'tr' DEĞİL. */
function readStoredLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return dictionaries[v] ? v : null;
  } catch {
    return null;
  }
}

// useFormatters.jsx'teki fetchTimezone() ile AYNI desen: modül önbelleğinde
// bir kez çekilir, uç erişilemezse hardcoded DEFAULT_LOCALE ile devam (sayfa
// kırılmaz). Admin panelden ayarlanır (bkz. server/src/services/locale.js).
let defaultLocalePromise = null;
function fetchSiteDefaultLocale() {
  if (!defaultLocalePromise) {
    defaultLocalePromise = api
      .get('/locale-config')
      .then(r => (dictionaries[r.data?.defaultLocale] ? r.data.defaultLocale : DEFAULT_LOCALE))
      .catch(() => DEFAULT_LOCALE);
  }
  return defaultLocalePromise;
}

/**
 * Uygulamanın kök seviyesinde bir kez mount edilir. Mantığın tamamı
 * (arama, interpolasyon, fallback, anahtar doğrulama) test edilmiş
 * `createI18nCore`'da yaşar — burası yalnızca React state/context sargısı.
 */
export function I18nProvider({ children }) {
  const hasStoredChoice = useRef(readStoredLocale() !== null);
  const [locale, setLocaleState] = useState(() => readStoredLocale() ?? DEFAULT_LOCALE);

  // Kullanıcı DAHA ÖNCE bir dil seçmişse (localStorage) admin'in site
  // varsayılanı bunu ASLA ezmez — yalnızca ilk ziyaretçi (hiç seçim yok)
  // için geçerli. Kısa bir an hardcoded 'tr' ile başlayıp admin değeri
  // gelince değişebilir (useFormatters'taki timezone ile aynı davranış).
  useEffect(() => {
    if (hasStoredChoice.current) return;
    let mounted = true;
    fetchSiteDefaultLocale().then(def => { if (mounted) setLocaleState(def); });
    return () => { mounted = false; };
  }, []);

  const core = useMemo(
    () => createI18nCore({ dictionaries, defaultLocale: locale, fallbackLocale: DEFAULT_LOCALE }),
    [locale],
  );

  const setLocale = useCallback((next) => {
    if (!dictionaries[next]) return;
    hasStoredChoice.current = true; // fetchSiteDefaultLocale henüz dönmediyse bile artık EZMESİN
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
