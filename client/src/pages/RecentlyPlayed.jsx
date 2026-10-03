import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useGameActivityStore } from '../store/gameActivityStore';
import { useLicensedIgamesGames } from '../hooks/useLicensedIgamesGames';
import { getInhouseGames } from '../data/inhouseGames';
import GameActivityGrid from '../components/gameActivity/GameActivityGrid';

export default function RecentlyPlayed() {
  const { t } = useTranslation();
  // playedAt'e göre en yeni en başta gelir (backend zaten bu sırayla döner).
  const recentlyPlayed = useGameActivityStore(s => s.recentlyPlayed);
  const ensureLoaded = useGameActivityStore(s => s.ensureLoaded);
  const { games: igamesGames, loading: igamesLoading } = useLicensedIgamesGames();
  const inhouseGames = useMemo(() => getInhouseGames(t), [t]);

  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const items = useMemo(() => {
    return recentlyPlayed
      .map(r => {
        if (r.kind === 'inhouse') {
          const g = inhouseGames.find(x => x.path === r.gameId);
          return g ? { kind: 'inhouse', id: g.id, name: g.name, image: g.image, accent: g.accent, to: g.path } : null;
        }
        const g = igamesGames.find(x => x.game_code === r.gameId);
        return g ? {
          kind: 'igames', id: g.game_code, name: g.game_name, image: g.game_image_narrow || g.game_image,
          to: `/igames/${encodeURIComponent(g.game_code)}?name=${encodeURIComponent(g.game_name)}`,
        } : null;
      })
      .filter(Boolean);
  }, [recentlyPlayed, inhouseGames, igamesGames]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">{t('home.sidebar.recentlyPlayed')}</h1>
      <p className="text-sm text-text-3 mb-5">{t('recentlyPlayed.subtitle')}</p>

      {igamesLoading && recentlyPlayed.some(r => r.kind === 'igames') ? (
        <div className="text-center text-text-3 py-12">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-3 mb-4">{t('recentlyPlayed.empty')}</p>
          <Link to="/casino" className="inline-flex px-4 py-2 rounded-lg text-sm font-bold bg-primary text-bg-deep hover:bg-primary/90 transition">
            {t('favorites.browseGames')}
          </Link>
        </div>
      ) : (
        <GameActivityGrid items={items} />
      )}
    </div>
  );
}
