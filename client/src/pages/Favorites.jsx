import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useGameActivityStore } from '../store/gameActivityStore';
import { useLicensedPalaceGames } from '../hooks/useLicensedPalaceGames';
import { getInhouseGames } from '../data/inhouseGames';
import GameActivityGrid from '../components/gameActivity/GameActivityGrid';

export default function Favorites() {
  const { t } = useTranslation();
  const favorites = useGameActivityStore(s => s.favorites);
  const ensureLoaded = useGameActivityStore(s => s.ensureLoaded);
  const { games: palaceGames, loading: palaceLoading } = useLicensedPalaceGames();
  const inhouseGames = useMemo(() => getInhouseGames(t), [t]);

  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const items = useMemo(() => {
    return favorites
      .map(f => {
        if (f.kind === 'inhouse') {
          const g = inhouseGames.find(x => x.path === f.gameId);
          return g ? { kind: 'inhouse', id: g.id, name: g.name, image: g.image, accent: g.accent, to: g.path } : null;
        }
        const g = palaceGames.find(x => x.game_code === f.gameId);
        return g ? {
          kind: 'palace', id: g.game_code, name: g.game_name, image: g.game_image_narrow || g.game_image,
          to: `/palace/${encodeURIComponent(g.game_code)}?name=${encodeURIComponent(g.game_name)}`,
        } : null;
      })
      .filter(Boolean);
  }, [favorites, inhouseGames, palaceGames]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">{t('home.sidebar.favorites')}</h1>
      <p className="text-sm text-text-3 mb-5">{t('favorites.subtitle')}</p>

      {palaceLoading && favorites.some(f => f.kind === 'palace') ? (
        <div className="text-center text-text-3 py-12">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-text-3 mb-4">{t('favorites.empty')}</p>
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
