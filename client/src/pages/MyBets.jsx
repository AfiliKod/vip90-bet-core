import { useEffect, useState } from 'react';
import api from '../services/api';
import { formatMoney } from '../utils/money.js';

const STATUS_LABEL = { pending: '⏳ Bekliyor', won: '✅ Kazandı', lost: '❌ Kaybetti', cancelled: '⊘ İptal' };
const STATUS_COLOR = { pending: 'text-warning', won: 'text-success', lost: 'text-danger', cancelled: 'text-text-3' };

export default function MyBets() {
  const [bets, setBets] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filter ? `?status=${filter}` : '';
    api.get(`/users/me/bets${params}`).then(r => { setBets(r.data.bets); setLoading(false); }).catch(() => setLoading(false));
  }, [filter]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-4">Bahislerim</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[['', 'Tümü'], ['pending', 'Bekleyenler'], ['won', 'Kazananlar'], ['lost', 'Kaybedenler']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition border ${filter === v ? 'bg-accent text-white border-accent' : 'text-text-3 hover:text-text-2 border-white/10'}`}>{l}</button>
        ))}
      </div>
      {loading ? <div className="text-center text-text-3 py-12">Yükleniyor...</div> : (
        <div className="space-y-3">
          {bets.map(bet => (
            <div key={bet._id} className="bg-bg-card border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-3 bg-bg-base px-2 py-0.5 rounded-full">{bet.type === 'combo' ? '🔗 Kombine' : '📌 Tekli'}</span>
                  <span className={`text-xs font-semibold ${STATUS_COLOR[bet.status]}`}>{STATUS_LABEL[bet.status]}</span>
                </div>
                <span className="text-xs text-text-3">{new Date(bet.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              {bet.selections.map((s, i) => (
                <div key={i} className="text-sm text-text-2 mb-1">
                  {s.eventLabel} — <span className="text-text-1">{s.oddLabel}</span> <span className="text-primary font-medium">@{s.oddValue}</span>
                </div>
              ))}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10 text-sm">
                <span className="text-text-3">Tutar: <span className="text-text-1 font-medium">{formatMoney(bet.stake)}</span></span>
                <span className="text-text-3">Kazanılabilir: <span className="text-success font-medium">{formatMoney(bet.potentialWin)}</span></span>
              </div>
            </div>
          ))}
          {!loading && !bets.length && <div className="text-center text-text-3 py-12">Bahis bulunamadı</div>}
        </div>
      )}
    </div>
  );
}
