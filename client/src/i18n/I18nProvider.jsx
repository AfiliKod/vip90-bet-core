import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createI18nCore, dictionaries, DEFAULT_LOCALE, LOCALES, isSupportedLocale, loadLocale, readStoredLocale, LOCALE_STORAGE_KEY } from './index.js';
import api from '../services/api';
import { setMoneyLocale } from '../utils/money.js';

const STORAGE_KEY = LOCALE_STORAGE_KEY;
const I18nContext = createContext(null);

// useFormatters.jsx'teki fetchTimezone() ile AYNI desen: modül önbelleğinde
// bir kez çekilir, uç erişilemezse hardcoded DEFAULT_LOCALE ile devam (sayfa
// kırılmaz). Admin panelden ayarlanır (bkz. server/src/services/locale.js).
let defaultLocalePromise = null;
function fetchSiteDefaultLocale() {
  if (!defaultLocalePromise) {
    defaultLocalePromise = api
      .get('/locale-config')
      .then(r => (isSupportedLocale(r.data?.defaultLocale) ? r.data.defaultLocale : DEFAULT_LOCALE))
      .catch(() => DEFAULT_LOCALE);
  }
  return defaultLocalePromise;
}

/**
 * Uygulamanın kök seviyesinde bir kez mount edilir. Mantığın tamamı
 * (arama, interpolasyon, fallback, anahtar doğrulama) test edilmiş
 * `createI18nCore`'da yaşar — burası yalnızca React state/context sargısı.
 *
 * Dictionaries other than tr load on demand (i18n/index.js). main.jsx loads
 * the stored locale before the first render; any later switch waits for its
 * dictionary, so the page never shows a half-loaded language.
 */
export function I18nProvider({ children }) {
  const hasStoredChoice = useRef(readStoredLocale() !== null);
  const [locale, setLocaleState] = useState(() => {
    const stored = readStoredLocale();
    return stored && dictionaries[stored] ? stored : DEFAULT_LOCALE;
  });

  const switchTo = useCallback(
    (next) => loadLocale(next).then(ready => { setLocaleState(ready); return ready; }),
    [],
  );

  // Kullanıcı DAHA ÖNCE bir dil seçmişse (localStorage) admin'in site
  // varsayılanı bunu ASLA ezmez — yalnızca ilk ziyaretçi (hiç seçim yok)
  // için geçerli. Kısa bir an hardcoded 'tr' ile başlayıp admin değeri
  // gelince değişebilir (useFormatters'taki timezone ile aynı davranış).
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored && !dictionaries[stored]) switchTo(stored); // preload failed or was skipped
    if (hasStoredChoice.current) return undefined;
    let mounted = true;
    fetchSiteDefaultLocale().then(def => { if (mounted && !hasStoredChoice.current) switchTo(def); });
    return () => { mounted = false; };
  }, [switchTo]);

  const core = useMemo(
    () => createI18nCore({ dictionaries, defaultLocale: locale, fallbackLocale: DEFAULT_LOCALE }),
    [locale],
  );

  // money.js modül-seviyesinde bir değişken tuttuğu için (React state değil)
  // burada senkronize edilir — formatMoney her çağrıldığında güncel arayüz
  // dilini kullanır (bkz. money.js).
  useEffect(() => {
    setMoneyLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (!isSupportedLocale(next)) return;
    hasStoredChoice.current = true; // fetchSiteDefaultLocale henüz dönmediyse bile artık EZMESİN
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* localStorage yoksa sessizce geç */ }
    switchTo(next);
  }, [switchTo]);

  const value = useMemo(
    () => ({ t: core.t, locale, setLocale, locales: LOCALES }),
    [core, locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation, I18nProvider içinde kullanılmalı');
  return ctx;
}
