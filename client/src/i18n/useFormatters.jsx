import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useTranslation } from './I18nProvider.jsx';
import { createFormatters, DEFAULT_TIMEZONE } from './format.js';

/**
 * U5 — Operatör saat dilimi bir kez çekilir, modül önbelleğinde tutulur.
 * Uç erişilemezse varsayılan (Europe/Istanbul) ile devam — sayfa kırılmaz.
 */
let tzPromise = null;
function fetchTimezone() {
  if (!tzPromise) {
    tzPromise = api
      .get('/locale-config')
      .then(r => (typeof r.data?.timezone === 'string' && r.data.timezone ? r.data.timezone : DEFAULT_TIMEZONE))
      .catch(() => DEFAULT_TIMEZONE);
  }
  return tzPromise;
}

/**
 * U1 deseninin format karşılığı: mantık format.js'te (saf, test edilmiş),
 * burası yalnızca React bağlantısı — locale I18nProvider'dan, saat dilimi
 * operatör ayarından gelir.
 */
export function useFormatters() {
  const { locale } = useTranslation();
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  useEffect(() => {
    let mounted = true;
    fetchTimezone().then(tz => {
      if (mounted) setTimezone(tz);
    });
    return () => { mounted = false; };
  }, []);

  return useMemo(
    () => createFormatters({ locale, timezone }),
    [locale, timezone],
  );
}
