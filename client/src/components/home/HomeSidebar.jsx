import { NavLink } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

/**
 * Anasayfaya özel sol navigasyon (yalnızca lg+, `HomePage.jsx` içinde mount
 * edilir) — kullanıcının onayladığı statik referansın (VIP90-BET-pixel-perfect-
 * homepage) sol menü yapısı, bizim gerçek route'larımızla.
 *
 * Favoriler / Son Oynananlar: bu özellik henüz yok (backend'de sıfırdan
 * aranmış, bulunamadı) — kullanıcı kararıyla bu turda yalnızca arayüz/link
 * olarak duruyor, tıklanınca hiçbir şey yapmıyor ("Yakında" rozetiyle
 * işaretli). Gerçek özellik ayrı bir işte inşa edilecek.
 */
const CATEGORY_SECTIONS_IDS = ['popular-oyunlar', 'ozel-oyunlar', 'slot-oyunlari', 'yeni-oyunlar'];

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

function DisabledRow({ icon, label }) {
  return (
    <button
      disabled
      className="w-full flex items-center gap-3 px-3 py-[9px] rounded-md text-[13px] font-semibold font-ui text-[#5c6469] cursor-default text-left"
    >
      <span className="material-symbols-outlined !text-[19px] shrink-0">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-[#4d5751] shrink-0">Yakında</span>
    </button>
  );
}

function CategoryButton({ icon, label, targetId }) {
  return (
    <button
      onClick={() => scrollToId(targetId)}
      className="w-full flex items-center gap-3 px-3 py-[9px] rounded-md text-[13px] font-semibold font-ui transition-colors text-[#c8ced2] hover:text-white text-left"
    >
      <span className="material-symbols-outlined !text-[19px] shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function HomeSidebar() {
  const { t } = useTranslation();

  return (
    <aside
      className="hidden lg:block w-[220px] shrink-0 rounded-xl p-2.5"
      style={{ background: `linear-gradient(180deg, ${HOME_CARD} 0%, #071017 100%)`, border: `1px solid ${HOME_BORDER}` }}
    >
      <Row to="/" end icon="home" label={t('nav.home')} />
      <DisabledRow icon="star" label={t('home.sidebar.favorites')} />
      <DisabledRow icon="history" label={t('home.sidebar.recentlyPlayed')} />

      <div className="mt-5">
        <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-[#5c6469] border-b border-[#202b31] pb-2 font-ui">
          {t('home.sidebar.categories')}
        </p>
        <div className="flex flex-col mt-1">
          <CategoryButton icon="whatshot" label={t('home.sidebar.popularGames')} targetId="popular-oyunlar" />
          <CategoryButton icon="diamond" label={t('home.games.exclusive')} targetId="ozel-oyunlar" />
          <CategoryButton icon="casino" label={t('home.sidebar.slotGames')} targetId="slot-oyunlari" />
          <CategoryButton icon="fiber_new" label={t('home.sidebar.newGames')} targetId="yeni-oyunlar" />
          <Row to="/casino" icon="apps" label={t('home.sidebar.allGames')} />
        </div>
      </div>

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
