import { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { translateTeam, translateLeague } from '../utils/i18n';
import { buildTeamGradient } from '../utils/matchHeroColors';

const TSDB_URL = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=';

const SPORT_GRADIENTS = {
  football:         'from-emerald-900 via-emerald-800 to-teal-900',
  basketball:       'from-orange-900 via-red-900 to-orange-800',
  tennis:           'from-lime-900 via-green-900 to-lime-800',
  volleyball:       'from-blue-900 via-sky-900 to-blue-800',
  icehockey:        'from-slate-800 via-blue-900 to-slate-900',
  golf:             'from-green-900 via-emerald-900 to-green-800',
  handball:         'from-purple-900 via-violet-900 to-purple-800',
  boxing:           'from-red-900 via-rose-900 to-red-800',
  baseball:         'from-amber-900 via-yellow-900 to-amber-800',
  americanfootball: 'from-brown-900 via-amber-900 to-yellow-900',
  rugby:            'from-stone-800 via-amber-900 to-stone-900',
  mma:              'from-zinc-900 via-red-900 to-zinc-800',
  snooker:          'from-green-950 via-emerald-900 to-teal-950',
  darts:            'from-indigo-900 via-blue-900 to-indigo-800',
  cricket:          'from-yellow-900 via-amber-800 to-yellow-800',
  waterpolo:        'from-cyan-900 via-blue-900 to-cyan-800',
  futsal:           'from-teal-900 via-green-900 to-teal-800',
  esports:          'from-violet-900 via-purple-900 to-violet-800',
};

function sportGradient(sport) {
  return SPORT_GRADIENTS[sport] ?? 'from-indigo-950 via-violet-950 to-indigo-900';
}

async function fetchTeamInfo(teamName) {
  const cacheKey = `tdb_team_v2_${teamName}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached);
    } catch {
      // bozuk/eski cache girdisi — aşağıda yeniden fetch edilecek
    }
  }

  try {
    const r = await fetch(`${TSDB_URL}${encodeURIComponent(teamName)}`, { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    const team = data?.teams?.[0];
    const info = { logo: team?.strTeamBadge ?? '', color: team?.strColour1 ?? '' };
    localStorage.setItem(cacheKey, JSON.stringify(info));
    return info;
  } catch {
    return { logo: '', color: '' };
  }
}

function TeamBadge({ name, logo }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-2 w-24">
      {logo ? (
        <img src={logo} alt={name} className="w-16 h-16 object-contain rounded-lg bg-white/5 p-1" />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
          <span className="text-lg font-black text-primary">{initials}</span>
        </div>
      )}
      <span className="text-xs font-semibold text-text-1 text-center leading-tight line-clamp-2">{name}</span>
    </div>
  );
}

export default function MatchHero({ event }) {
  const [homeLogo, setHomeLogo] = useState('');
  const [awayLogo, setAwayLogo] = useState('');
  const [homeColor, setHomeColor] = useState('');
  const [awayColor, setAwayColor] = useState('');
  const lang = useSettingsStore(s => s.preferences.language);
  const locale = lang === 'en' ? 'en-GB' : 'tr-TR';
  const homeName = translateTeam(event.homeTeam.name, lang);
  const awayName = translateTeam(event.awayTeam.name, lang);
  const leagueName = translateLeague(event.league, lang);

  useEffect(() => {
    fetchTeamInfo(event.homeTeam.name).then(info => {
      setHomeLogo(info.logo);
      setHomeColor(info.color);
    });
    fetchTeamInfo(event.awayTeam.name).then(info => {
      setAwayLogo(info.logo);
      setAwayColor(info.color);
    });
  }, [event.homeTeam.name, event.awayTeam.name]);

  const isLive = event.status === 'live';
  const teamGradient = buildTeamGradient(homeColor, awayColor);

  return (
    <div
      className={`relative overflow-hidden ${teamGradient ? '' : `bg-gradient-to-br ${sportGradient(event.sport)}`} border border-white/10 rounded-xl p-6 mb-4`}
      style={teamGradient ? { background: teamGradient } : undefined}
    >
      {teamGradient && <div className="absolute inset-0 bg-black/50" />}

      <div className="relative z-10">
        <div className="text-center text-text-3 text-sm mb-5">
          {event.leagueFlag} {leagueName}
        </div>

        <div className="flex items-center justify-center gap-6">
          <TeamBadge name={homeName} logo={homeLogo} />

          <div className="text-center min-w-[100px]">
            {isLive ? (
              <>
                <div className="text-4xl font-black text-text-1 tabular-nums">
                  {event.liveScore?.home ?? 0}
                  <span className="text-text-3 mx-2">–</span>
                  {event.liveScore?.away ?? 0}
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 text-sm font-semibold">{event.liveScore?.minute ?? 0}'</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-text-3 text-lg font-bold">vs</div>
                <div className="text-text-3 text-xs mt-1.5">
                  {new Date(event.startTime).toLocaleString(locale, {
                    day: '2-digit', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </>
            )}
          </div>

          <TeamBadge name={awayName} logo={awayLogo} />
        </div>
      </div>
    </div>
  );
}
