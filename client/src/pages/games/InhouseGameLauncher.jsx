import { Link } from 'react-router-dom';

/**
 * Bu, gerçek in-house oyun launcher'ının yerini tutan bir stub'dır — asıl
 * oyun motoru (server/src/provider/, game-host/) ayrı, lisanslı bir pakette
 * yaşıyor ve bu (açık kaynak çekirdek) repoya dahil değil. Lisanslı bir
 * kurulumda bu dosyanın yerini gerçek launcher alır.
 */
export default function InhouseGameLauncher({ gameId }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-bg-card border border-white/10 rounded-2xl p-8">
        <div className="text-4xl mb-3">🎮</div>
        <h2 className="text-xl font-bold mb-2">In-house Oyunlar modülü gerekli</h2>
        <p className="text-text-3 text-sm mb-4">
          "{gameId}" oyununu oynamak için In-house Oyunlar entegrasyon paketi
          gerekiyor — bu, çekirdek platformdan ayrı, lisanslı bir modüldür.
        </p>
        <Link to="/" className="text-primary underline text-sm">Ana sayfaya dön</Link>
      </div>
    </div>
  );
}
