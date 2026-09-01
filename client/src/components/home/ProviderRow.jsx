import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

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
          {providers.map(p => (
            <Link
              key={p.provider_id}
              to={`/casino?provider=${p.provider_id}`}
              className="group shrink-0 w-[130px] h-[64px] rounded-xl flex items-center justify-center transition-all duration-200"
              style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, transparent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
            >
              {p.provider_logo ? (
                <img
                  src={p.provider_logo}
                  alt={p.provider_name || p.name}
                  className="h-7 w-auto max-w-[90px] object-contain opacity-70 grayscale-[35%] group-hover:opacity-100 group-hover:grayscale-0 transition-all duration-200"
                />
              ) : (
                <span className="text-xs font-bold text-[#c8ced2] truncate px-2">{p.provider_name || p.name}</span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
