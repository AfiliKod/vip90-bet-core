import { useEffect } from 'react';
import { applySiteTheme } from './applySiteTheme';

/**
 * Sunucudan tema override'larını çekip kök elemana CSS custom property
 * olarak enjekte eder. Render etmez; App.jsx kökünde bir kez mount edilir.
 *
 * Fetch/apply mantığı applySiteTheme.js'te — settingsStore.js kullanıcı
 * "Site Teması"na dönünce aynı fonksiyonu tekrar çağırıyor.
 */
export default function ThemeStyleInjector() {
  useEffect(() => { applySiteTheme(); }, []);
  return null;
}
