import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBetSlipStore } from '../store/betSlipStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';
import { formatMoney, getActiveCurrency } from '../utils/money.js';

function SlipContent({ onSubmitted }) {
  const { selections, type, stake, setType, setStake, removeSelection, clear, getTotalOdds } = useBetSlipStore();
  const user = useAuthStore(s => s.user);
  const updateBalance = useAuthStore(s => s.updateBalance);
  const addToast = useToastStore(s => s.add);
  const navigate = useNavigate();
  const location = useLocation();
  const totalOdds = getTotalOdds();
  const potentialWin = stake && !isNaN(parseFloat(stake)) ? +(parseFloat(stake) * totalOdds).toFixed(2) : 0;

  const submit = async () => {
    if (!stake || parseFloat(stake) < 1) return addToast(`Minimum bahis tutarı ${formatMoney(1)}`, 'warning');
    if (!user) {
      // Misafir: bahis kuponu (state, sayfa/route'tan bağımsız) korunur — login sonrası
      // aynı sayfaya dönülür, kullanıcı bilinçli olarak tekrar "Bahis Yap"a basar.
      onSubmitted?.();
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    try {
      const { data } = await api.post('/bets', { selections, type, stake: parseFloat(stake) });
      updateBalance(data.newBalance);
      clear();
      addToast('Bahis başarıyla yapıldı! 🎯', 'success');
      onSubmitted?.();
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'Bahis yapılamadı', 'error');
    }
  };

  if (!selections.length) return (
    <div className="p-4 text-center text-text-3 text-sm">
      Bahis kuponunuz boş.<br />Etkinliklerden oran seçin.
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="font-semibold text-text-1 text-sm">Bahis Kuponu ({selections.length})</span>
        <button onClick={clear} className="text-text-3 hover:text-danger text-xs transition">Temizle</button>
      </div>
      {selections.length > 1 && (
        <div className="flex p-2 gap-1 border-b border-white/10">
          {['single', 'combo'].map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${type === t ? 'bg-accent text-white' : 'text-text-2 hover:bg-bg-hover'}`}>
              {t === 'single' ? 'Tekli' : `Kombine (x${selections.length})`}
            </button>
          ))}
        </div>
      )}
      <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
        {selections.map(s => (
          <div key={`${s.eventId}-${s.marketType}`} className="bg-bg-base rounded-lg p-3 flex items-start justify-between gap-2">
            <div className="text-xs flex-1 min-w-0">
              <div className="text-text-2 truncate">{s.eventLabel}</div>
              <div className="text-text-3 mt-0.5">{s.oddLabel}</div>
              <div className="text-primary font-bold mt-1">@{s.oddValue.toFixed(2)}</div>
            </div>
            <button onClick={() => removeSelection(s.eventId, s.marketType)} className="text-text-3 hover:text-danger shrink-0 mt-0.5 text-sm">✕</button>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-2">Toplam Oran</span>
          <span className="text-text-1 font-bold">{totalOdds.toFixed(2)}</span>
        </div>
        <input
          value={stake}
          onChange={e => setStake(e.target.value)}
          type="number" min="1" placeholder={`Bahis tutarı (${getActiveCurrency().symbol})`}
          className="w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-primary"
        />
        {potentialWin > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-text-2">Kazanılabilir</span>
            <span className="text-success font-bold">{formatMoney(potentialWin)}</span>
          </div>
        )}
        <button onClick={submit} className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-2.5 rounded-lg hover:opacity-90 transition text-sm">
          Bahis Yap
        </button>
      </div>
    </>
  );
}

export default function BetSlip() {
  const { selections, getTotalOdds } = useBetSlipStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const totalOdds = getTotalOdds();

  return (
    <>
      {/* ── Masaüstü: sabit yan panel ── */}
      <aside className="w-72 shrink-0 hidden lg:block">
        <div className="bg-bg-card border border-white/10 rounded-xl overflow-hidden sticky top-20">
          <SlipContent />
        </div>
      </aside>

      {/* ── Mobil: BottomNav'ın üstünde bar, sadece seçim varken ve sheet kapalıyken ── */}
      {selections.length > 0 && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-14 inset-x-0 z-40 lg:hidden flex items-center justify-between px-4 py-3 shadow-lg"
          style={{ background: 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 100%)' }}
        >
          <span className="text-black font-bold text-sm">{selections.length} seçim · Oran {totalOdds.toFixed(2)}</span>
          <span className="text-black font-black text-sm">Bahis Yap →</span>
        </button>
      )}

      {/* ── Mobil: tam kupon bottom-sheet ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-bg-card rounded-t-2xl border-t border-white/10 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-end px-3 pt-3">
              <button onClick={() => setMobileOpen(false)} className="text-text-3 hover:text-text-1 text-2xl leading-none px-2" aria-label="Kapat">✕</button>
            </div>
            <SlipContent onSubmitted={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
