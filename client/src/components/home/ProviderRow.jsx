import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

// Palace'ın kendi provider API'si (`getProviders()`) `provider_logo` alanını
// güvenilir doldurmuyor (çoğu sağlayıcıda boş dönüyor) — bu yüzden logolar
// Palace/casino content provider admin panelinden (Games > Providers List) indirilip
// `public/images/providers/{provider_id}.png` altına yerleştirildi. Anahtar
// admin paneldeki provider ID'siyle birebir aynı.
const LOCAL_LOGO_IDS = new Set([1, 2, 3, 4, 5, 7, 9, 12, 13, 14, 15, 16, 17, 20, 21, 23, 24, 25, 26, 29, 30]);

function providerLogo(p) {
  if (LOCAL_LOGO_IDS.has(p.provider_id)) return `/images/providers/${p.provider_id}.png`;
  return p.provider_logo || null;
}

/**
 * Slider'ın altında, oyun satırlarından önce — sağlayıcı (provider) rayı.
 * `GameRowSection`'daki AYNI yatay-kaydırmalı `flex + overflow-x-auto +
 * shrink-0` deseni kullanılır (bkz. HomePage.jsx notu — kartların satırı
 * doldurmak için gerilmesi, taşma hatasına geri dönüş anlamına gelir).
 */
export default function ProviderRow() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.post('/palace/providers', { lang: 'tr' }).then(({ data }) => {
      if (!cancelled) setProviders(data?.data || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (providers.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="px-4">
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2 font-ui">
            <span className="material-symbols-outlined !text-[19px]" style={{ color: 'var(--color-primary)' }} aria-hidden="true">apartment</span>
            {t('home.providers.title')}
          </h2>
          <Link to="/casino" className="hidden sm:inline-flex items-center gap-1 text-xs font-bold font-ui text-[#c8ced2] hover:text-white">
            {t('home.games.viewAll')}
          </Link>
        </div>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
          {providers.map(p => {
            const logo = providerLogo(p);
            const name = p.provider_name || p.name;
            return (
              <Link
                key={p.provider_id}
                to={`/casino?provider=${p.provider_id}`}
                className="group shrink-0 w-[130px] h-[76px] rounded-xl flex flex-col items-center justify-center gap-1.5 px-3 transition-all duration-200"
                style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, transparent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
              >
                {logo && (
                  <img
                    src={logo}
                    alt=""
                    className="h-6 w-auto max-w-[90px] object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-200"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <span className="text-[11px] font-bold text-[#c8ced2] group-hover:text-white truncate max-w-full">{name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
