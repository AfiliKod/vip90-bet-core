/**
 * Game rows shared by the casino page (HomePage.jsx, `/casino`) and the
 * landing page (LandingPage.jsx, `/`): the row frame, the two card kinds and
 * Moved here unchanged from HomePage.jsx; the data side is in homeCatalog.js.
 */
import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useGameActivityStore } from '../../store/gameActivityStore';
import { useAuthStore } from '../../store/authStore';
import ScrollHintArrow from '../../components/home/ScrollHintArrow';
import { Icon, FavoriteButton } from '../../components/home/HomeUI';
import { HOME_CARD, HOME_BORDER } from './homeTheme';


/**
 * Card image that requests its file only near the screen. Native
 * `loading="lazy"` still fetched every card of a horizontal row at once (the
 * row is inside the lazy-load distance), so ten 200–400 KB provider images
 * per row downloaded during the first load. An IntersectionObserver on the
 * viewport is clipped by the row's own overflow, so off-row cards wait until
 * the row is scrolled.
 */
function NearImage({ src, ...props }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <img ref={ref} src={near ? src : undefined} loading="lazy" decoding="async" {...props} />;
}

export function IgamesGameCard({ game }) {
  const symbol = game.game_code;
  const name = game.game_name;
  const image = game.game_image_narrow || game.game_image;
  const recordPlay = useGameActivityStore(s => s.recordPlay);
  const user = useAuthStore(s => s.user);
  return (
    <Link
      to={`/igames/${encodeURIComponent(symbol)}?name=${encodeURIComponent(name)}`}
      onClick={() => { if (user) recordPlay(symbol, 'igames'); }}
      className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[150px]"
      style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
    >
      <FavoriteButton gameId={symbol} kind="igames" />
      <div className="aspect-[3/4] relative overflow-hidden">
        <NearImage
          src={image}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          onError={e => { e.currentTarget.closest('a').style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <span className="text-[11px] font-bold text-white block truncate font-ui">{name}</span>
        </div>
      </div>
    </Link>
  );
}

export function GameRowSection({ id, icon, title, subtitle, viewAllTo, viewAllLabel, children }) {
  const scrollRef = useRef(null);
  return (
    <section className="mt-[19px]" id={id}>
      <div className="px-4">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2 font-ui">
              <Icon name={icon} className="!text-[19px]" style={{ color: 'var(--color-primary)' }} />
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#7d8a83] mt-0.5 font-ui">{subtitle}</p>}
          </div>
          {viewAllTo && (
            <Link to={viewAllTo} className="hidden sm:inline-flex items-center gap-1 text-xs font-bold font-ui text-[#c8ced2] hover:text-white">
              {viewAllLabel}
            </Link>
          )}
        </div>
        <div className="relative">
          <div ref={scrollRef} className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
            {children}
          </div>
          <ScrollHintArrow containerRef={scrollRef} />
        </div>
      </div>
    </section>
  );
}

export function InhouseGameCard({ game }) {
  const { t } = useTranslation();
  const recordPlay = useGameActivityStore(s => s.recordPlay);
  const currentUser = useAuthStore(s => s.user);
  return (
    <Link to={game.path} onClick={() => { if (currentUser) recordPlay(game.path, 'inhouse'); }}
      className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center shrink-0 w-[140px] sm:w-[150px]"
      style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${game.accent}66`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
    >
      <FavoriteButton gameId={game.path} kind="inhouse" />
      <div className="aspect-[3/4] relative overflow-hidden">
        <NearImage src={game.image} alt={game.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/10" />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded font-ui"
          style={{ background: 'rgba(2,8,13,0.75)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }}>
          <Icon name="diamond" className="!text-[10px]" />
          {t('home.games.originalBadge')}
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <span className="text-sm font-extrabold block font-ui" style={{ color: game.accent }}>{game.name}</span>
        </div>
      </div>
    </Link>
  );
}
