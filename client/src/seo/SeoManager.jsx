import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { useTranslation } from '../i18n';
import { useBrandingStore } from '../store/brandingStore';
import { pageTitleKey, formatTitle } from './titles';

/**
 * document.title'ın TEK sahibi. Site başlığı: SEO ayarı > marka adı (branding)
 * > varsayılan; sayfa adı rotadan (i18n) gelir, admin'in başlık şablonuyla
 * birleşir. BrandingInjector artık title'a dokunmaz.
 *
 * Sunucu ilk HTML'e site başlığını zaten yazar (seo/render.js); bu bileşen
 * istemci tarafı gezinmede güncel tutar. Render etmez.
 */
export default function SeoManager() {
  const { t, locale } = useTranslation();
  const { pathname } = useLocation();
  const brandName = useBrandingStore(s => s.siteName);
  const [seo, setSeo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/seo')
      .then(({ data }) => { if (!cancelled) setSeo(data?.values || {}); })
      .catch(() => { if (!cancelled) setSeo({}); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (seo === null) return; // ayar gelmeden başlığı ezme (sunucunun yazdığı kalır)
    const key = pageTitleKey(pathname);
    const site = seo.siteTitle || brandName || undefined;
    document.title = formatTitle(seo.titleTemplate, key ? t(key) : null, site);
  }, [seo, pathname, brandName, t, locale]);

  return null;
}
