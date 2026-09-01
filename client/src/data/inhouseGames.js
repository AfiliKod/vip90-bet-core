// Site-genelinde in-house oyunları arayan/çözen yerler için tek, hafif kaynak
// (arama, Favoriler/Son Oynananlar sayfaları). `HomePage.jsx`'teki
// `INHOUSE_GAMES` ve `CasinoRedesign.jsx`'teki `inhouseGames(t)` kendi kart
// tasarımlarına özel ek alanlar (glow, pillBg, -v2 thumbnail vb.) taşıdığı
// için burada YENİDEN YAZILMADI — bu liste yalnızca id/isim/path/görsel gibi
// paylaşılan minimum alanları tutar.
export function getInhouseGames(t) {
  return [
    { id: 'crash',       name: t('games.crash.title'),       path: '/games/crash',       accent: '#f97316', image: '/images/games/crash.png' },
    { id: 'mines',       name: t('games.mines.title'),       path: '/games/mines',       accent: '#34d399', image: '/images/games/mines.png' },
    { id: 'plinko',      name: t('games.plinko.title'),      path: '/games/plinko',      accent: '#a78bfa', image: '/images/games/plinko.png' },
    { id: 'dice',        name: t('games.dice.title'),        path: '/games/dice',        accent: '#22d3ee', image: '/images/games/dice.png' },
    { id: 'limbo',       name: t('games.limbo.title'),       path: '/games/limbo',       accent: '#f472b6', image: '/images/games/limbo.png' },
    { id: 'wheel',       name: t('games.wheel.title'),       path: '/games/wheel',       accent: '#fbbf24', image: '/images/games/wheel.png' },
    { id: 'roulette',    name: t('games.roulette.title'),    path: '/games/roulette',    accent: '#f87171', image: '/images/games/roulette.png' },
    { id: 'blackjack',   name: t('games.blackjack.title'),   path: '/games/blackjack',   accent: '#4ade80', image: '/images/games/blackjack.png' },
    { id: 'baccarat',    name: t('games.baccarat.title'),    path: '/games/baccarat',    accent: '#eab308', image: '/images/games/baccarat.png' },
    { id: 'keno',        name: t('games.keno.title'),        path: '/games/keno',        accent: '#2dd4bf', image: '/images/games/keno.png' },
    { id: 'hilo',        name: t('games.hilo.title'),        path: '/games/hilo',        accent: '#818cf8', image: '/images/games/hilo.png' },
    { id: 'dragontiger', name: t('games.dragontiger.title'), path: '/games/dragontiger', accent: '#fb923c', image: '/images/games/dragontiger.png' },
    { id: 'videopoker',  name: t('games.videopoker.title'),  path: '/games/videopoker',  accent: '#c084fc', image: '/images/games/videopoker.png' },
  ];
}
