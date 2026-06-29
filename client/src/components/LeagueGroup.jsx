import { useState } from 'react';
import EventRow, { ROW_GRID, ROW_GRID_MOBILE, useIsMobile } from './EventRow';
import MarketDrawer from './MarketDrawer';
import { useSettingsStore } from '../store/settingsStore';
import { translateLeagueKey } from '../utils/i18n';

export default function LeagueGroup({ league, leagueFlag, events, openDrawerId, onToggleDrawer }) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const lang = useSettingsStore(s => s.preferences.language);
  const displayLeague = translateLeagueKey(league, lang);

  return (
    <div className="mb-1 rounded-lg overflow-hidden border border-white/10">
      {/* Lig başlığı */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-card hover:bg-white/[0.04] transition-colors text-left"
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
          {events.length} {lang === 'en' ? 'match' : 'maç'}
        </span>
        <span className="text-text-3 text-[10px]">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <>
          {/* Sütun etiketleri */}
          <div
            className="grid text-[9px] font-semibold text-text-3 uppercase tracking-wide px-[10px] py-1 bg-bg-base border-t border-white/5"
            style={{ gridTemplateColumns: isMobile ? ROW_GRID_MOBILE : ROW_GRID, gap: '3px' }}
          >
            <span />
            <span>Maç</span>
            <span className="text-center">1</span>
            <span className="text-center">X</span>
            <span className="text-center">2</span>
            {!isMobile && <span />}
            {!isMobile && <span className="text-center">Alt</span>}
            {!isMobile && <span className="text-center">Üst</span>}
            {!isMobile && <span className="text-center">Top</span>}
            <span className="text-center">+N</span>
          </div>

          {/* Etkinlik satırları */}
          {events.map(event => (
            <div key={event._id}>
              <EventRow
                event={event}
                isDrawerOpen={openDrawerId === event._id}
                onToggleDrawer={() => onToggleDrawer(event._id)}
              />
              {openDrawerId === event._id && <MarketDrawer event={event} />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
