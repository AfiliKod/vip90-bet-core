import api from '../services/api';

/**
 * Sunucudan operatörün marka renklerini (Theme paneli) çekip kök elemana
 * CSS custom property olarak enjekte eder. ThemeStyleInjector (app boot) ve
 * settingsStore (kullanıcı "Site Teması"na dönünce) tarafından ortak
 * kullanılır — iki ayrı yerde aynı fetch+apply mantığı tekrarlanmasın.
 *
 * Fetch başarısız olursa index.css'teki varsayılan değerler zaten yerinde
 * durduğu için sessizce hiçbir şey yapmaz.
 */
export async function applySiteTheme() {
  try {
    const { data } = await api.get('/theme');
    if (!data?.vars) return;
    const root = document.documentElement;
    for (const [cssVar, value] of Object.entries(data.vars)) {
      root.style.setProperty(cssVar, value);
    }
  } catch { /* varsayılan tema ile devam */ }
}
