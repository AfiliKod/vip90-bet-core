import { Link } from 'react-router-dom';
import OddButton from './OddButton';
import { sportIcon } from '../utils/sportMeta';
import { useSettingsStore } from '../store/settingsStore';
import { translateTeam, translateLeague } from '../utils/i18n';

export default function EventCard({ event }) {
  const lang = useSettingsStore(s => s.preferences.language);
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR';
  const homeName = translateTeam(event.homeTeam.name, lang);
  const awayName = translateTeam(event.awayTeam.name, lang);
  const leagueName = translateLeague(event.league, lang);
  const label = `${homeName} vs ${awayName}`;
  const mainMarket = event.markets[0];
  const isLive = event.status === 'live';
  return (
    <div
      className="group relative bg-bg-card border border-white/10 rounded-2xl p-5 transition-all duration-300 overflow-hidden hover:border-[#00d4ff55] hover:shadow-[0_0_32px_rgba(0,212,255,0.15)] hover:-translate-y-0.5"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(124,58,237,0.06) 100%)' }}
      />
      <div className="relative flex items-center justify-between mb-4">
        <span className="text-sm text-text-3 font-bold">{sportIcon(event.sport)} {leagueName}</span>
        {isLive ? (
          <span className="flex items-center gap-2 text-sm text-live font-black">
            <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
            {event.liveScore.minute}' {event.liveScore.home}-{event.liveScore.away}
          </span>
        ) : (
          <span className="text-sm text-text-3 font-semibold">
            {new Date(event.startTime).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <Link to={`/events/${event._id}`} className="relative flex items-center justify-between mb-5 group/link">
        <span className="font-black text-base text-text-1 group-hover/link:text-cyan-400 transition">{homeName}</span>
        <span className="text-text-3 text-sm font-black">vs</span>
        <span className="font-black text-base text-text-1 group-hover/link:text-cyan-400 transition">{awayName}</span>
      </Link>
      {mainMarket && (
        <div className="relative flex flex-wrap gap-2">
          {mainMarket.odds.filter(o => o.isActive !== false).map(odd => (
            <OddButton key={odd.id} eventId={event._id} eventLabel={label} marketType={mainMarket.type} odd={odd} />
          ))}
        </div>
      )}
    </div>
  );
}