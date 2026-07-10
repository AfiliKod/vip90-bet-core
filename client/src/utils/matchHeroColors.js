const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TSDB_URL = 'https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=';

export function isValidHex(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function buildTeamGradient(homeColor, awayColor) {
  if (!isValidHex(homeColor) || !isValidHex(awayColor)) return null;
  return `linear-gradient(120deg, ${homeColor} 0%, ${awayColor} 100%)`;
}

// TheSportsDB'den takım logosu + birincil rengi çeker, localStorage'da cache'ler.
// MatchHero.jsx ve MatchSlider.jsx tarafından paylaşılan tek fetch+cache noktası.
export async function fetchTeamInfo(teamName) {
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

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = n => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

// Takım isminden HER ZAMAN geçerli bir hex renk üretir (deterministik, saf
// fonksiyon — aynı isim her zaman aynı rengi verir). TheSportsDB'de bulunamayan
// takımlar için ortak bir gri/gradient yerine maça özel bir renk sağlar.
export function deterministicColorFromName(name) {
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 55, 32);
}

// apiColor geçerliyse onu kullanır, değilse takım isminden deterministik
// fallback üretir — sonuç HER ZAMAN geçerli hex'tir (null asla dönmez).
export function resolveTeamColor(name, apiColor) {
  return isValidHex(apiColor) ? apiColor : deterministicColorFromName(name);
}
