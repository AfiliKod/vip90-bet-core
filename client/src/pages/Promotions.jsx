import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';

export default function Promotions() {
  const [promos, setPromos] = useState([]);
  const [activePromo, setActivePromo] = useState(null);
  const [acceptedTC, setAcceptedTC] = useState(false);
  const addToast = useToastStore(s => s.add);
  const user = useAuthStore(s => s.user);

  useEffect(() => { api.get('/promotions').then(r => setPromos(r.data.promotions)).catch(() => {}); }, []);

  async function claim() {
    if (!activePromo || !acceptedTC) return;
    try {
      const { data } = await api.post(`/promotions/${activePromo._id}/claim`, {
        acceptedBonusTerms: true,
      });
      addToast(data.message, 'success');
      setPromos(p => p.map(x => x._id === activePromo._id ? { ...x, claimedBy: [...(x.claimedBy || []), user?._id] } : x));
      setActivePromo(null);
      setAcceptedTC(false);
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'Kampanya kullanılamadı', 'error');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">🎁 Kampanyalar</h1>
      <div className="grid gap-4">
        <div className="bg-bg-card border border-accent/30 rounded-xl p-5 flex items-center justify-between gap-4" style={{ boxShadow: '0 0 16px rgba(0,212,255,0.08)' }}>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-text-1 mb-1">🎁 Arkadaşını Getir, %10 Kâr Payı Kazan</h3>
            <p className="text-text-3 text-sm">Davet ettiğin arkadaşların platforma kazandırdığı kârın %10'u anında hesabına aktarılır — süresiz, sınırsız.</p>
          </div>
          <Link to="/profile"
            className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold text-black transition"
            style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', boxShadow: '0 0 12px #00d4ff55' }}>
            Linkimi Al
          </Link>
        </div>
        {promos.map(p => {
          const claimed = p.claimedBy?.some(id => id === user?._id);
          return (
            <div key={p._id} className="bg-bg-card border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-text-1 mb-1">{p.title}</h3>
                <p className="text-text-3 text-sm mb-3">{p.description}</p>
                <div className="flex flex-wrap gap-2 text-xs text-text-3">
                  <span className="bg-bg-base px-2 py-1 rounded">💰 {p.amount}₺</span>
                  <span className="bg-bg-base px-2 py-1 rounded">📊 Min. oran: {p.minOdds}</span>
                  <span className="bg-bg-base px-2 py-1 rounded">🔄 {p.wageringMultiplier ?? p.wagering}x çevrim</span>
                  {p.deadlineDays && <span className="bg-bg-base px-2 py-1 rounded">⏰ {p.deadlineDays}g</span>}
                </div>
              </div>
              <button
                onClick={() => !claimed && setActivePromo(p)}
                disabled={claimed}
                className={`shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                  claimed ? 'bg-bg-base text-text-3 cursor-not-allowed' : 'text-black'
                }`}
                style={!claimed ? { background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', boxShadow: '0 0 12px #00d4ff55' } : undefined}
              >
                {claimed ? '✓ Kullanıldı' : 'Kullan'}
              </button>
            </div>
          );
        })}
        {!promos.length && <div className="text-center text-text-3 py-12">Aktif kampanya bulunamadı</div>}
      </div>

      {/* T&C Modal (Phase A5) */}
      {activePromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="max-w-md w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: '#0c1220', border: '1px solid rgba(0,212,255,0.3)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text-1">{activePromo.title}</h3>
              <button onClick={() => { setActivePromo(null); setAcceptedTC(false); }} className="text-text-3 hover:text-text-1 text-xl leading-none">×</button>
            </div>

            <div className="space-y-3 mb-5">
              <DetailRow label="Bonus Tutarı" value={`₺${activePromo.amount}`} />
              <DetailRow label="Çevrim Şartı" value={`${activePromo.wageringMultiplier ?? activePromo.wagering}x`} />
              <DetailRow label="Min. Oran" value={activePromo.minOdds} />
              {activePromo.deadlineDays && <DetailRow label="Süre" value={`${activePromo.deadlineDays} gün`} />}
              <DetailRow label="Oyun Ağırlıkları" value="Spor 1.0 · Casino 0.5 · Canlı 0.7" small />
            </div>

            <div className="text-xs space-y-1.5 mb-4 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', color: '#8899bb' }}>
              <p>• Bonus cash'e çevrilmeden çekim yapılırsa bonus iptal edilir.</p>
              <p>• Maks. bahis: ₺50 (slot) / ₺100 (spor).</p>
              <p>• Karşıt bahis ve risk-free oyun bonus iptaline yol açar.</p>
              <p>
                Detaylı koşullar için{' '}
                <Link to="/legal/bonus-terms" target="_blank" className="underline" style={{ color: '#00d4ff' }}>
                  Bonus Kullanım Koşulları
                </Link>
                'nı okuyun.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={acceptedTC}
                onChange={e => setAcceptedTC(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded cursor-pointer accent-cyan-400"
              />
              <span className="text-xs leading-relaxed" style={{ color: '#c8d8f0' }}>
                Bonus şartlarını okudum, kabul ediyorum.
              </span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => { setActivePromo(null); setAcceptedTC(false); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-white/10 hover:border-white/20 transition"
              >
                İptal
              </button>
              <button
                onClick={claim}
                disabled={!acceptedTC}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', boxShadow: '0 0 12px #00d4ff55' }}
              >
                Bonusu Al
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, small }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-text-3">{label}</span>
      <span className={`font-bold text-text-1 ${small ? 'text-xs' : ''}`}>{value}</span>
    </div>
  );
}