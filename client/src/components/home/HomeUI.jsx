import { useNavigate } from 'react-router-dom';
import { useGameActivityStore } from '../../store/gameActivityStore';
import { useAuthStore } from '../../store/authStore';
import { HOME_BORDER } from '../../pages/home/homeTheme';

// HomePage.jsx ve AllGamesSection.jsx arasında paylaşılan küçük, saf UI
// parçaları — HomePage'e özel state/closure taşımazlar.

export function Icon({ name, className = '', style }) {
  return <span className={`material-symbols-outlined ${className}`} style={style} aria-hidden="true">{name}</span>;
}

// Kart üstü favori kalbi — Link navigasyonunu engelleyip yalnızca toggle
// tetikler. Misafir kullanıcıda login sayfasına yönlendirir (backend
// favoriler uçları requireAuth arkasında, bkz. server/src/routes/users.js).
export function FavoriteButton({ gameId, kind }) {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const isFavorite = useGameActivityStore(s => s.isFavorite(gameId, kind));
  const toggleFavorite = useGameActivityStore(s => s.toggleFavorite);

  return (
    <button
      type="button"
      aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) { navigate('/login'); return; }
        toggleFavorite(gameId, kind);
      }}
      className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
      style={{ background: 'rgba(2,8,13,0.65)', border: `1px solid ${isFavorite ? 'var(--color-primary)' : HOME_BORDER}` }}
    >
      {/* Tek glyph ("favorite") + `FILL` eksen değeri: `material-symbols-outlined`
          sınıfı varsayılan olarak FILL=0 kullanır, bu da "favorite" glyph'inin
          bile ince bir ANAHAT olarak çizilmesine yol açar — yalnızca renk
          değişimi favorilenmiş/favorilenmemiş halleri yeterince ayırt
          etmiyordu. FILL:1 gerçek içi-dolu bir kalp render eder (Material
          Symbols'ın kendi "favorite toggle" deseni). */}
      <Icon
        name="favorite"
        className="!text-[14px]"
        style={{ color: isFavorite ? 'var(--color-primary)' : '#c8ced2', fontVariationSettings: `'FILL' ${isFavorite ? 1 : 0}` }}
      />
    </button>
  );
}
