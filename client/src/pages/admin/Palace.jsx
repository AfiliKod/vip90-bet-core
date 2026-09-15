/**
 * Bu, gerçek Palace Casino admin panelinin yerini tutan bir stub'dır — asıl
 * entegrasyon ayrı, lisanslı bir pakette yaşıyor ve bu (açık kaynak
 * çekirdek) repoya dahil değil. Lisanslı bir kurulumda bu dosyanın yerini
 * gerçek admin arayüzü alır.
 */
export default function AdminPalace() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-bg-card border border-white/10 rounded-2xl p-8">
        <div className="text-4xl mb-3">🃏</div>
        <h2 className="text-xl font-bold mb-2">Casino İçeriği modülü gerekli</h2>
        <p className="text-text-3 text-sm">
          Palace Casino yönetim ekranı için Casino İçeriği entegrasyon
          paketi gerekiyor — bu, çekirdek platformdan ayrı, lisanslı bir
          modüldür.
        </p>
      </div>
    </div>
  );
}
