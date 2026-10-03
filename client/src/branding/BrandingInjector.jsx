import { useEffect } from 'react';
import api from '../services/api';
import { useBrandingStore } from '../store/brandingStore';

const FONT_FACE_ID = 'branding-custom-font';
const FAVICON_SELECTOR = "link[rel~='icon']";

/**
 * Sunucudan marka override'larını çekip global browser durumuna (title,
 * favicon, @font-face) enjekte eder ve Navbar gibi bileşenlerin okuyacağı
 * paylaşılan store'u (brandingStore) doldurur. Fetch başarısız olursa
 * index.html'deki varsayılanlar zaten yerinde durduğu için sessizce hiçbir
 * şey yapmaz — aynı fail-safe yaklaşım ThemeStyleInjector'da kurulmuştu.
 *
 * Render etmez; App.jsx kökünde ThemeStyleInjector'ın yanında bir kez mount
 * edilir.
 */
export default function BrandingInjector() {
  useEffect(() => {
    let cancelled = false;
    api.get('/branding').then(({ data }) => {
      if (cancelled || !data?.values) return;
      const v = data.values;

      // document.title burada YAZILMAZ — tek sahibi seo/SeoManager.jsx
      // (başlık şablonu + sayfa adı). siteName brandingStore üzerinden gider.

      if (v.favicon) {
        let link = document.querySelector(FAVICON_SELECTOR);
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = v.favicon;
      }

      if (v.fontFamily) {
        document.documentElement.style.setProperty('--font-display', v.fontFamily);
      }

      if (v.fontFile) {
        let style = document.getElementById(FONT_FACE_ID);
        if (!style) {
          style = document.createElement('style');
          style.id = FONT_FACE_ID;
          document.head.appendChild(style);
        }
        const family = v.fontFamily || 'BrandCustomFont';
        style.textContent = `@font-face { font-family: ${JSON.stringify(family)}; src: url(${JSON.stringify(v.fontFile)}); font-display: swap; }`;
      }

      useBrandingStore.getState().setBranding(v);
    }).catch(() => { /* varsayılan markalama ile devam */ });
    return () => { cancelled = true; };
  }, []);

  return null;
}
