import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useGameActivityStore } from '../../store/gameActivityStore';
import { useAuthStore } from '../../store/authStore';
import { HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';
import { Icon, FavoriteButton } from './HomeUI';

const PAGE_SIZE = 40; // 8 sütun × 5 satır — diğer GameRowSection satırlarındaki gibi bir satırda 8 oyun

function GridGameCard({ game }) {
  const symbol = game.game_code;
  const name = game.game_name;
  const image = game.game_image_narrow || game.game_image;
  const recordPlay = useGameActivityStore(s => s.recordPlay);
  const user = useAuthStore(s => s.user);
  return (
    <Link
      to={`/palace/${encodeURIComponent(symbol)}?name=${encodeURIComponent(name)}`}
      onClick={() => { if (user) recordPlay(symbol, 'palace'); }}
      className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center"
      style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}` }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary) 40%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = HOME_BORDER; }}
    >
      <FavoriteButton gameId={symbol} kind="palace" />
      <div className="aspect-[3/4] relative overflow-hidden">
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          onError={e => { e.currentTarget.closest('a').style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <span className="text-[11px] font-bold text-white block truncate font-ui">{name}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Sayfanın en altındaki "Tüm Oyunlar" alanı — diğer `GameRowSection`
 * satırlarından farklı olarak yatay-kaydırmalı DEĞİL, gerçek bir
 * 6-sütun × 5-satır grid + "Daha Fazla Göster" butonuyla çalışır.
 *
 * İki modu var:
 * - `providerFilter` yoksa: `games` (HomePage'de bir kez shuffle edilmiş
 *   `palaceGames`) içinden rastgele bir örneklem gösterilir.
 * - `providerFilter` varsa (ProviderRow'dan bir sağlayıcı seçildiğinde):
 *   `games` yalnızca o sağlayıcının oyunlarıdır, başlıkta sağlayıcı adı +
 *   filtreyi temizleme butonu gösterilir.
 */
export default function AllGamesSection({ games, loading, providerFilter, onClearFilter }) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Filtre değişince (yeni sağlayıcı seçildi/temizlendi) sayaç sıfırlanır.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [providerFilter?.id]);

  const visible = games.slice(0, visibleCount);
  const hasMore = visibleCount < games.length;

  return (
    <section className="mt-8">
      <div className="px-4">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2 font-ui">
              <Icon name="apps" className="!text-[19px]" style={{ color: 'var(--color-primary)' }} />
              {providerFilter ? providerFilter.name : t('home.sidebar.allGames')}
            </h2>
            <p className="text-xs text-[#7d8a83] mt-0.5 font-ui">
              {providerFilter ? t('home.providers.filteredDesc') : t('home.games.allGamesDesc')}
            </p>
          </div>
          {providerFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="inline-flex items-center gap-1 text-xs font-bold font-ui text-[#c8ced2] hover:text-white"
            >
              <Icon name="close" className="!text-[15px]" />
              {t('home.providers.clearFilter')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[#7d8a83] font-ui">{t('common.loading')}</div>
        ) : games.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#7d8a83] font-ui">{t('home.providers.emptyGames')}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
              {visible.map(g => <GridGameCard key={g.game_code} game={g} />)}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-5">
                <button
                  type="button"
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold font-ui transition-colors"
                  style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}`, color: '#c8ced2' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#c8ced2'; }}
                >
                  {t('home.games.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
