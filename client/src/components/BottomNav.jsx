import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from '../i18n';

const TABS = [
  { to: '/bahis',     icon: '⚽', label: 'nav.sports', end: true  },
  { to: '/canli',     icon: '🔴', label: 'nav.live',  end: false },
  { to: '/casino',    icon: '🎰', label: 'nav.casino', end: false },
];

export default function BottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  if (location.pathname.startsWith('/games/') || /^\/casino(-v2)?\/[^/]+/.test(location.pathname)) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden backdrop-blur-md"
      style={{
        background: 'linear-gradient(180deg, rgba(13,21,38,0.85) 0%, rgba(6,13,26,0.95) 100%)',
        borderTop: '1px solid #ffffff14',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4), 0 -1px 0 #00d4ff22 inset',
      }}
    >
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `relative flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all duration-200 ${
              isActive ? '' : 'text-text-3 hover:text-text-1'
            }`}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute inset-x-3 top-0 h-[3px] rounded-full"
                  style={{ background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 100%)' }}
                />
              )}
              <span
                className={`text-2xl leading-none transition-transform duration-200 ${
                  isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(0,212,255,0.6)]' : ''
                }`}
              >
                {tab.icon}
              </span>
              <span
                className={`text-[11px] tracking-wide transition-all ${
                  isActive ? 'font-black' : 'font-semibold'
                }`}
                style={isActive ? {
                  background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                } : {}}
              >
                {t(tab.label)}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}