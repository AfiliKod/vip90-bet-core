import { NavLink } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { HOME_GREEN } from '../../pages/home/homeTheme';

/**
 * Anasayfaya özel sol navigasyon (yalnızca lg+, `HomePage.jsx` içinde mount
 * edilir) — betface.png referansının sol menüsünün pixel-perfect uyarlaması:
 * düz liste (kutu/pill arka plan yok), aktif satır yalnızca yeşil metin+ikon,
 * küçük gri versal bölüm başlıkları. Sidebar.jsx'ten (spor/lig filtre ağacı,
 * `/bahis` ve `/canli`'de kullanılıyor) FARKLI, bağımsız bir bileşen.
 *
 * Linkler yalnızca gerçekten var olan route'lara gider — referanstaki
 * "Favoriler", "Jackpot", "Turnuvalar", "Sadakat Programı" gibi bizde
 * karşılığı olmayan sayfalar bilinçli olarak atlandı.
 */
const CATEGORY_LINKS = [
  { key: 'sports', to: '/bahis', icon: 'sports_soccer' },
  { key: 'live', to: '/canli', icon: 'sensors' },
  { key: 'casino', to: '/casino', icon: 'casino' },
  { key: 'promotions', to: '/promotions', icon: 'redeem' },
];

const ACCOUNT_LINKS = [
  { key: 'myBets', to: '/my-bets', icon: 'receipt_long' },
  { key: 'profile', to: '/profile', icon: 'person' },
  { key: 'helpCenter', to: '/help', icon: 'support_agent' },
  { key: 'settings', to: '/settings', icon: 'settings' },
];

function Row({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] font-semibold font-ui transition-colors ${
          isActive ? '' : 'text-[#8b978f] hover:text-white'
        }`
      }
      style={({ isActive }) => (isActive ? { color: HOME_GREEN } : undefined)}
    >
      <span className="material-symbols-outlined !text-[19px] shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function HomeSidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden lg:block w-[212px] shrink-0">
      <Row to="/" end icon="home" label={t('nav.home')} />

      <div className="mt-4">
        <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#4d5751] font-ui">
          {t('home.sidebar.categories')}
        </p>
        <div className="flex flex-col">
          {CATEGORY_LINKS.map(l => (
            <Row key={l.key} to={l.to} icon={l.icon} label={t(`nav.${l.key}`)} />
          ))}
          <button
            onClick={() => document.getElementById('ozel-oyunlar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] font-semibold font-ui transition-colors text-[#8b978f] hover:text-white text-left"
          >
            <span className="material-symbols-outlined !text-[19px] shrink-0">diamond</span>
            <span className="truncate">{t('home.games.exclusive')}</span>
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#4d5751] font-ui">
          {t('home.sidebar.account')}
        </p>
        <div className="flex flex-col">
          {ACCOUNT_LINKS.map(l => (
            <Row key={l.key} to={l.to} icon={l.icon} label={t(`nav.${l.key}`)} />
          ))}
        </div>
      </div>
    </aside>
  );
}
