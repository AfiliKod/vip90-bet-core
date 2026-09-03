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
  australianfootball: { label: 'Avustralya Futbolu', labelEn: 'Australian Football', icon: '🏈' },
  rugbyleague:      { label: 'Rugby Ligi',          labelEn: 'Rugby League',      icon: '🏉' },
  rugbyunion:       { label: 'Rugby Birliği',       labelEn: 'Rugby Union',       icon: '🏉' },
  billiards:        { label: 'Bilardo',             labelEn: 'Billiards',         icon: '🎱' },
  cycling:          { label: 'Bisiklet Yarışı',     labelEn: 'Cycling',           icon: '🚴' },
  formula1:         { label: 'Formula 1',           labelEn: 'Formula 1',         icon: '🏎️' },
  motorsport:       { label: 'Motor Sporları',      labelEn: 'Motor Sports',      icon: '🏍️' },
  sailing:          { label: 'Yelken',               labelEn: 'Sailing',           icon: '⛵' },
  alpineskiing:     { label: 'Kayak',                labelEn: 'Alpine Skiing',     icon: '⛷️' },
  autoracing:       { label: 'Otomobil Yarışı',      labelEn: 'Auto Racing',       icon: '🏁' },
  biathlon:         { label: 'Biatlon',              labelEn: 'Biathlon',          icon: '🎿' },
  chess:            { label: 'Satranç',              labelEn: 'Chess',             icon: '♟️' },
};

export function sportIcon(sport) {
  return SPORT_META[sport]?.icon ?? '🏆';
}

// Material Symbols karşılıkları — yalnızca yeni navy tasarımın (HomeSidebar
// kabuğu, Spor Bahisleri/Canlı Bahis'e taşınan hali) tek-renkli ikon diliyle
// tutarlı kalması gereken yerlerde kullanılır. SPORT_META.icon (emoji) diğer
// tüm kullanım yerlerinde (maç kartı, mobil çip vb.) DEĞİŞMEDEN kalıyor —
// bu, o emoji kullanımlarını etkilemeyen ayrı, ek bir eşleme.
const SPORT_ICON_MATERIAL = {
  football: 'sports_soccer',
  basketball: 'sports_basketball',
  tennis: 'sports_tennis',
  volleyball: 'sports_volleyball',
  icehockey: 'sports_hockey',
  golf: 'golf_course',
  handball: 'sports_handball',
  boxing: 'sports_mma',
  baseball: 'sports_baseball',
  americanfootball: 'sports_football',
  rugby: 'sports_rugby',
  mma: 'sports_martial_arts',
  cricket: 'sports_cricket',
  waterpolo: 'pool',
  futsal: 'sports_soccer',
  esports: 'sports_esports',
  australianfootball: 'sports_football',
  rugbyleague: 'sports_rugby',
  rugbyunion: 'sports_rugby',
  billiards: 'sports_bar',
  cycling: 'directions_bike',
  formula1: 'sports_motorsports',
  motorsport: 'two_wheeler',
  sailing: 'sailing',
  alpineskiing: 'downhill_skiing',
  autoracing: 'sports_motorsports',
  biathlon: 'downhill_skiing',
  chess: 'extension',
};

export function sportIconMaterial(sport) {
  return SPORT_ICON_MATERIAL[sport] ?? 'sports';
}

export function sportLabel(sport, lang) {
  const meta = SPORT_META[sport];
  if (!meta) return sport;
  return lang === 'en' ? (meta.labelEn ?? meta.label) : meta.label;
}
