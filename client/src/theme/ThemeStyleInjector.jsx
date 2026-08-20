import { useEffect } from 'react';
import api from '../services/api';

/**
 * Sunucudan tema override'larını çekip kök elemana CSS custom property
 * olarak enjekte eder. Fetch başarısız olursa index.css'teki varsayılan
 * değerler zaten yerinde durduğu için sessizce hiçbir şey yapmaz —
 * arayüz kırılmaz, yalnızca override'sız (varsayılan) görünür.
 *
 * Render etmez; App.jsx kökünde bir kez mount edilir.
 */
export default function ThemeStyleInjector() {
  useEffect(() => {
    let cancelled = false;
    api.get('/theme').then(({ data }) => {
      if (cancelled || !data?.vars) return;
      const root = document.documentElement;
      for (const [cssVar, value] of Object.entries(data.vars)) {
        root.style.setProperty(cssVar, value);
      }
    }).catch(() => { /* varsayılan tema ile devam */ });
    return () => { cancelled = true; };
  }, []);

  return null;
}
