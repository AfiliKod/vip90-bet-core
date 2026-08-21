import { useEffect } from 'react';
import api from '../services/api';
import { setActiveCurrency } from './money.js';

/**
 * Sunucudan aktif para birimini çekip `money.js`'in modül-seviyesi
 * önbelleğine yazar. Fetch başarısız olursa varsayılan (TRY) ile devam
 * eder — arayüz kırılmaz. `ThemeStyleInjector` ile aynı desen.
 *
 * Render etmez; App.jsx kökünde bir kez mount edilir.
 */
export default function CurrencyLoader() {
  useEffect(() => {
    let cancelled = false;
    api.get('/currency').then(({ data }) => {
      if (cancelled || !data?.active) return;
      setActiveCurrency(data.active);
    }).catch(() => { /* varsayılan (TRY) ile devam */ });
    return () => { cancelled = true; };
  }, []);

  return null;
}
