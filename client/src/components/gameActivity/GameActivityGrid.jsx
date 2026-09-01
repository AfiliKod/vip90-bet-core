import { Link } from 'react-router-dom';

/**
 * Favorites.jsx / RecentlyPlayed.jsx paylaşımlı kart grid'i — sabit-genişlik
 * yatay-kaydırma DEĞİL, tam sayfa `flex-wrap` grid (bu sayfalar kendi başına
 * bir liste sayfası, GameRowSection'ın slider mantığına ihtiyacı yok).
 */
export default function GameActivityGrid({ items }) {
  return (
    <div className="flex flex-wrap gap-3 sm:gap-4">
      {items.map(g => (
        <Link
          key={`${g.kind}-${g.id}`}
          to={g.to}
          className="group relative rounded-xl overflow-hidden transition-all duration-200 text-center w-[140px] sm:w-[150px] bg-bg-card border border-white/10 hover:border-white/25"
        >
          <div className="aspect-[3/4] relative overflow-hidden">
            <img
              src={g.image}
              alt={g.name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <span className="text-[11px] font-bold text-white block truncate">{g.name}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
