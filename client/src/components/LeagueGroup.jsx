import { useState } from 'react';
import MiniEventCard from './MiniEventCard';
import MarketDrawer from './MarketDrawer';
import { useSettingsStore } from '../store/settingsStore';
import { translateLeagueKey } from '../utils/i18n';
import { useTranslation } from '../i18n';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';

export default function LeagueGroup({ league, leagueFlag, events, openDrawerId, onToggleDrawer, accent, bgColor }) {
  const [collapsed, setCollapsed] = useState(false);
  const lang = useSettingsStore(s => s.preferences.language);
  const { t } = useTranslation();
  const displayLeague = translateLeagueKey(league, lang);

  return (
    <div className="mb-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${SURFACE_BORDER}` }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
        style={{ background: SURFACE_CARD_BG }}
      >
        <span className="text-base">{leagueFlag}</span>
        <span className="flex-1 text-xs font-semibold text-text-1 truncate">
          {displayLeague.includes(' > ')
            ? <>
                <span className="text-text-3 font-normal">{displayLeague.split(' > ').slice(0, -1).join(' › ')}</span>
                <span className="text-text-3 mx-1">›</span>
                <span>{displayLeague.split(' > ').at(-1)}</span>
              </>
            : displayLeague}
        </span>
        <span className="text-[10px] text-text-3 bg-bg-base rounded-full px-2 py-0.5 mr-1">
          {events.length} {t('sports.match')}
        </span>
        <span className="text-text-3 text-[10px]">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-white/5 p-2">
          <div className="flex flex-col gap-2">
            {events.map(event => (
              <div key={event._id}>
                <MiniEventCard
                  event={event}
                  live={event.status === 'live'}
                  accent={accent}
                  bgColor={bgColor}
                  onExtraClick={() => onToggleDrawer(event._id)}
                />
                {openDrawerId === event._id && <MarketDrawer event={event} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
