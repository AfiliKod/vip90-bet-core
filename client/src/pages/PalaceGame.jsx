import { useParams, Link } from 'react-router-dom';

/**
 * Bu, gerçek Palace Casino oyun launcher'ının yerini tutan bir stub'dır —
 * asıl entegrasyon (server/src/routes/palace.js ve ilgili servisler) ayrı,
 * lisanslı bir pakette yaşıyor ve bu (açık kaynak çekirdek) repoya dahil
 * değil. Lisanslı bir kurulumda bu dosyanın yerini gerçek launcher alır.
 */
export default function PalaceGame() {
  const { gameId } = useParams();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-bg-card border border-white/10 rounded-2xl p-8">
        <div className="text-4xl mb-3">🃏</div>
        <h2 className="text-xl font-bold mb-2">Casino İçeriği modülü gerekli</h2>
        <p className="text-text-3 text-sm mb-4">
          "{gameId}" oyununu oynamak için Casino İçeriği (Palace) entegrasyon
          paketi gerekiyor — bu, çekirdek platformdan ayrı, lisanslı bir
          modüldür.
        </p>
        <Link to="/" className="text-primary underline text-sm">Ana sayfaya dön</Link>
      </div>
    </div>
  );
}
