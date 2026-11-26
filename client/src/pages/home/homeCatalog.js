/**
 * Data for the shared game rows (homeRows.jsx): our own games and the
 * provider catalog. Used by HomePage.jsx (`/casino`) and LandingPage.jsx (`/`).
 */
import { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';

// Igames agregatörden gerçek/lisanslı oyun kataloğu çekilecek sağlayıcılar
// (bkz. GET /api/igames/providers) — T3'te bağlanan gerçek kontrat. Belirli
// oyun görselleri/başlıkları burada kod içine GÖMÜLMEDİ (T5 varlık denetiminde
// lisanssız Pragmatic Play/BGaming verisi tam da bu yüzden silinmişti) —
// hepsi çalışma zamanında Igames'ın kendi CDN'inden canlı çekiliyor.
const IGAMES_PROVIDER_IDS = [1, 15]; // Pragmatic Play, Spribe

export function getInhouseGames(t) {
  return [
    { name: t('games.crash.title'), path: '/games/crash', accent: '#f97316', image: '/images/games/crash.webp' },
    { name: t('games.mines.title'),     path: '/games/mines', accent: '#34d399', image: '/images/games/mines.webp' },
    { name: t('games.plinko.title'),    path: '/games/plinko', accent: '#a78bfa', image: '/images/games/plinko.webp' },
    { name: t('games.dice.title'),      path: '/games/dice', accent: '#22d3ee', image: '/images/games/dice.webp' },
    { name: t('games.limbo.title'),     path: '/games/limbo', accent: '#f472b6', image: '/images/games/limbo.webp' },
    { name: t('games.crazywheel.title'),     path: '/games/crazywheel', accent: '#fbbf24', image: '/images/games/crazywheel.webp' },
    { name: t('games.roulette.title'),  path: '/games/roulette', accent: '#f87171', image: '/images/games/roulette.webp' },
    { name: t('games.blackjack.title'), path: '/games/blackjack', accent: '#4ade80', image: '/images/games/blackjack.webp' },
    { name: t('games.baccarat.title'),  path: '/games/baccarat', accent: '#eab308', image: '/images/games/baccarat.webp' },
    { name: t('games.keno.title'),      path: '/games/keno', accent: '#2dd4bf', image: '/images/games/keno.webp' },
    { name: t('games.hilo.title'),      path: '/games/hilo', accent: '#818cf8', image: '/images/games/hilo.webp' },
    // 13. oyun: kayıtli in-house oyunlari arasinda vardi, lobide gorunmuyordu (2026-10-08).
    { name: t('games.videopoker.title'), path: '/games/videopoker', accent: '#c084fc', image: '/images/games/videopoker.webp' },
    { name: t('games.dragontiger.title'), path: '/games/dragontiger', accent: '#fb923c', image: '/images/games/dragontiger.webp' },
    { name: t('games.coinflip.title'), path: '/games/coinflip', accent: '#facc15', image: '/images/games/coinflip.webp' },
    // 15. oyun: KING OF MONEY — kart görseli oyunun onaylı kapak görselinin kırpımı.
    { name: t('games.kingofmoney.title'), path: '/games/kingofmoney', accent: '#f3c04b', image: '/images/games/kingofmoney.webp' },
  ];
}

/**
 * Provider catalog rows. `enabled: false` skips every request (the landing
 * page passes the casino-content module state).
 */
export function useIgamesCatalog({ enabled = true } = {}) {
  const [igamesGames, setIgamesGames] = useState([]);
  // False until the provider lists answer (or fail); lets a page hold the
  // rows' space instead of shifting content when they arrive.
  const [loaded, setLoaded] = useState(false);
  // Admin'in Modül Ayarları'ndan seçtiği "Popüler Oyunlar" listesi (game_code
  // dizisi) — boşsa aşağıda eski davranışa (ilk 10 oyun) düşülür.
  const [popularGameCodes, setPopularGameCodes] = useState([]);

  // Igames agregatörden gerçek katalog — hiçbir oyun adı/görseli kod içinde
  // sabit değil, hepsi burada canlı çekiliyor (bkz. yukarıdaki not).
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    Promise.all(
      IGAMES_PROVIDER_IDS.map(provider_id =>
        api.post('/igames/games', { lang: 'tr', provider_id }).then(r => r.data?.data || []).catch(() => [])
      )
    ).then(lists => {
      if (cancelled) return;
      setIgamesGames(lists.flat().filter(g => g.launch_enable !== false));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    api.get('/igames/popular-games').then(({ data }) => setPopularGameCodes(data?.gameCodes || [])).catch(() => {});
  }, [enabled]);

  const { popularGames, slotGames, newGames } = useMemo(() => {
    const slots = igamesGames.filter(g => g.category === 'Slots');
    const byDateDesc = [...igamesGames].sort((a, b) => new Date(b.reg_date) - new Date(a.reg_date));

    // Admin curated bir liste seçtiyse (Modül Ayarları → Igames) o sırayla
    // göster; hiç seçim yapılmamışsa eski davranışa (ilk 10 oyun) düş.
    let curatedPopular = null;
    if (popularGameCodes.length) {
      const byCode = new Map(igamesGames.map(g => [g.game_code, g]));
      curatedPopular = popularGameCodes.map(code => byCode.get(code)).filter(Boolean);
    }

    return {
      popularGames: curatedPopular?.length ? curatedPopular : igamesGames.slice(0, 10),
      slotGames: slots.slice(0, 10),
      newGames: byDateDesc.slice(0, 10),
    };
  }, [igamesGames, popularGameCodes]);

  return { igamesGames, popularGames, slotGames, newGames, loaded };
}
