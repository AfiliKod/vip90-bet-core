export const SPORT_META = {
  football:         { label: 'Futbol',            labelEn: 'Football',          icon: '⚽' },
  basketball:       { label: 'Basketbol',          labelEn: 'Basketball',        icon: '🏀' },
  tennis:           { label: 'Tenis',              labelEn: 'Tennis',            icon: '🎾' },
  volleyball:       { label: 'Voleybol',           labelEn: 'Volleyball',        icon: '🏐' },
  icehockey:        { label: 'Buz Hokeyi',         labelEn: 'Ice Hockey',        icon: '🏒' },
  golf:             { label: 'Golf',               labelEn: 'Golf',              icon: '⛳' },
  handball:         { label: 'Hentbol',            labelEn: 'Handball',          icon: '🤾' },
  boxing:           { label: 'Boks',               labelEn: 'Boxing',            icon: '🥊' },
  baseball:         { label: 'Beyzbol',            labelEn: 'Baseball',          icon: '⚾' },
  americanfootball: { label: 'Amerikan Futbolu',   labelEn: 'American Football', icon: '🏈' },
  rugby:            { label: 'Rugby',              labelEn: 'Rugby',             icon: '🏉' },
  mma:              { label: 'MMA',                labelEn: 'MMA',               icon: '🥋' },
  snooker:          { label: 'Snooker',            labelEn: 'Snooker',           icon: '🎱' },
  darts:            { label: 'Dart',               labelEn: 'Darts',             icon: '🎯' },
  cricket:          { label: 'Kriket',             labelEn: 'Cricket',           icon: '🏏' },
  waterpolo:        { label: 'Su Topu',            labelEn: 'Water Polo',        icon: '🤽' },
  futsal:           { label: 'Futsal',             labelEn: 'Futsal',            icon: '🥅' },
  esports:          { label: 'E-Spor',             labelEn: 'E-Sports',          icon: '🎮' },
};

export function sportIcon(sport) {
  return SPORT_META[sport]?.icon ?? '🏆';
}

export function sportLabel(sport, lang) {
  const meta = SPORT_META[sport];
  if (!meta) return sport;
  return lang === 'en' ? (meta.labelEn ?? meta.label) : meta.label;
}
