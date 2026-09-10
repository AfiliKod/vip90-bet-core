import { useMemo } from 'react';
import { SPORT_META, sportLabel } from '../utils/sportMeta';

// Sidebar.jsx'teki SPORT_ORDER ile birebir aynı — spor kategori sırası
// tüm gezinme yüzeylerinde (masaüstü sidebar + mobil chip satırı) tutarlı olsun diye.
const SPORT_ORDER = [
  'football', 'basketball', 'tennis', 'volleyball', 'icehockey',
  'handball', 'boxing', 'baseball', 'americanfootball', 'rugby',
  'mma', 'golf', 'cricket', 'snooker', 'darts', 'waterpolo', 'futsal', 'esports',
];

// Verilen event listesinden mevcut sporları çıkarır, SPORT_ORDER'a göre sıralar
// ve her biri için { id, label, icon, count } döner. Mobil "kategori" chip
// satırları (Bahis.jsx, Live.jsx) için kullanılır.
export function useSportChips(events, locale) {
  return useMemo(() => {
    const counts = {};
    for (const ev of events) {
      if (!ev.sport) continue;
      counts[ev.sport] = (counts[ev.sport] ?? 0) + 1;
    }
    const allSports = Object.keys(counts);
    const ordered = SPORT_ORDER.filter(s => counts[s]);
    const unordered = allSports.filter(s => !SPORT_ORDER.includes(s)).sort();
    return [...ordered, ...unordered].map(sport => ({
      id: sport,
      label: sportLabel(sport, locale),
      icon: SPORT_META[sport]?.icon ?? '🏆',
      count: counts[sport],
    }));
  }, [events, locale]);
}
