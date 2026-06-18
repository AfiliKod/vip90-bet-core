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
    <div className="bg-bg-card border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-3">{sportIcon(event.sport)} {leagueName}</span>
        {isLive ? (
          <span className="flex items-center gap-1.5 text-xs text-live font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            {event.liveScore.minute}' {event.liveScore.home}-{event.liveScore.away}
          </span>
        ) : (
          <span className="text-xs text-text-3">
            {new Date(event.startTime).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <Link to={`/events/${event._id}`} className="flex items-center justify-between mb-4 group">
        <span className="font-medium text-text-1 group-hover:text-primary transition">{homeName}</span>
        <span className="text-text-3 text-sm">vs</span>
        <span className="font-medium text-text-1 group-hover:text-primary transition">{awayName}</span>
      </Link>
      {mainMarket && (
        <div className="flex flex-wrap gap-2">
          {mainMarket.odds.filter(o => o.isActive !== false).map(odd => (
            <OddButton key={odd.id} eventId={event._id} eventLabel={label} marketType={mainMarket.type} odd={odd} />
          ))}
        </div>
      )}
    </div>
  );
}
