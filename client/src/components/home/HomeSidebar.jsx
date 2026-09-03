import { NavLink } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

/**
 * Sol navigasyon kabuğu — kullanıcının onayladığı statik referansın
 * (VIP90-BET-pixel-perfect-homepage) sol menü yapısı. Yalnızca anasayfaya
 * özel DEĞİL: `categories` prop'u verilmezse anasayfanın kendi oyun
 * kategorileri (Popüler/Özel/Slot/Yeni Oyunlar) varsayılan olarak kullanılır;
 * Spor Bahisleri/Canlı Bahis gibi sayfalar kendi kategori listesini (spor
 * dalları) geçirerek AYNI kabuğu 1:1 yeniden kullanır — bkz. Bahis.jsx/Live.jsx.
 */
function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Row({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-[9px] rounded-md text-[13px] font-semibold font-ui transition-colors ${
          isActive ? 'text-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] border-l-2' : 'text-[#c8ced2] hover:text-white'
        }`
      }
      style={({ isActive }) => (isActive ? { borderColor: 'var(--color-primary)' } : { borderLeft: '2px solid transparent' })}
    >
      <span className="material-symbols-outlined !text-[19px] shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function CategoryButton({ icon, label, targetId, onClick, badge, active }) {
  return (
    <button
      onClick={onClick ?? (() => scrollToId(targetId))}
      className={`w-full flex items-center gap-3 px-3 py-[9px] rounded-md text-[13px] font-semibold font-ui transition-colors text-left border-l-2 ${
        active ? 'text-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]' : 'text-[#c8ced2] hover:text-white'
      }`}
      style={{ borderColor: active ? 'var(--color-primary)' : 'transparent' }}
    >
      <span className="material-symbols-outlined !text-[19px] shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge != null && <span className="shrink-0 text-[10px] text-[#5c6469] font-normal">{badge}</span>}
    </button>
  );
}

export default function HomeSidebar({ categories, topExtraLink, featuredLeagues, featuredLeaguesTitle }) {
  const { t } = useTranslation();

  return (
    <aside
      className="hidden lg:block w-[220px] shrink-0 rounded-xl p-2.5"
      style={{ background: `linear-gradient(180deg, ${HOME_CARD} 0%, #071017 100%)`, border: `1px solid ${HOME_BORDER}` }}
    >
      <Row to="/" end icon="home" label={t('nav.home')} />
      {topExtraLink && <Row to={topExtraLink.to} icon={topExtraLink.icon} label={topExtraLink.label} />}
      <Row to="/favorites" icon="star" label={t('home.sidebar.favorites')} />
      <Row to="/recently-played" icon="history" label={t('home.sidebar.recentlyPlayed')} />

      <div className="mt-5">
        <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#5c6469] border-b border-[#202b31] pb-2 font-ui">
          {t('home.sidebar.categories')}
        </p>
        <div className="flex flex-col mt-1">
          {categories ? (
            categories.map(c => (
              <CategoryButton key={c.key ?? c.label} icon={c.icon} label={c.label} onClick={c.onClick} badge={c.badge} active={c.active} />
            ))
          ) : (
            <>
              <CategoryButton icon="whatshot" label={t('home.sidebar.popularGames')} targetId="popular-oyunlar" />
              <CategoryButton icon="diamond" label={t('home.games.exclusive')} targetId="ozel-oyunlar" />
              <CategoryButton icon="casino" label={t('home.sidebar.slotGames')} targetId="slot-oyunlari" />
              <CategoryButton icon="fiber_new" label={t('home.sidebar.newGames')} targetId="yeni-oyunlar" />
              <Row to="/casino" icon="apps" label={t('home.sidebar.allGames')} />
            </>
          )}
        </div>
      </div>

      {featuredLeagues?.length > 0 && (
        <div className="mt-5">
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#5c6469] border-b border-[#202b31] pb-2 font-ui">
            {featuredLeaguesTitle ?? t('sidebar.featuredLeagues')}
          </p>
          <div className="flex flex-col mt-1">
            {featuredLeagues.map(lg => (
              <CategoryButton key={lg.key} icon="emoji_events" label={lg.label} onClick={lg.onClick} badge={lg.badge} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#5c6469] border-b border-[#202b31] pb-2 font-ui">
          {t('home.sidebar.quickAccess')}
        </p>
        <div className="flex flex-col mt-1">
          <Row to="/profile" icon="person" label={t('nav.profile')} />
          <Row to="/my-bets" icon="receipt_long" label={t('nav.myBets')} />
          <Row to="/help" icon="support_agent" label={t('nav.helpCenter')} />
          <Row to="/settings" icon="settings" label={t('nav.settings')} />
        </div>
      </div>
    </aside>
  );
}
