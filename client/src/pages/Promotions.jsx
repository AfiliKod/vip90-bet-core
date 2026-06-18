import { useEffect, useState } from 'react';
import api from '../services/api';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';

export default function Promotions() {
  const [promos, setPromos] = useState([]);
  const addToast = useToastStore(s => s.add);
  const user = useAuthStore(s => s.user);

  useEffect(() => { api.get('/promotions').then(r => setPromos(r.data.promotions)).catch(() => {}); }, []);

  const claim = async (id) => {
    try {
      const { data } = await api.post(`/promotions/${id}/claim`);
      addToast(data.message, 'success');
      setPromos(p => p.map(x => x._id === id ? { ...x, claimedBy: [...(x.claimedBy || []), user?._id] } : x));
    } catch (e) { addToast(e.response?.data?.error?.message || 'Kampanya kullanılamadı', 'error'); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">🎁 Kampanyalar</h1>
      <div className="grid gap-4">
        {promos.map(p => {
          const claimed = p.claimedBy?.some(id => id === user?._id);
          return (
            <div key={p._id} className="bg-bg-card border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-bold text-text-1 mb-1">{p.title}</h3>
                <p className="text-text-3 text-sm mb-3">{p.description}</p>
                <div className="flex flex-wrap gap-3 text-xs text-text-3">
                  <span className="bg-bg-base px-2 py-1 rounded">💰 {p.amount}₺</span>
                  <span className="bg-bg-base px-2 py-1 rounded">📊 Min. oran: {p.minOdds}</span>
                  <span className="bg-bg-base px-2 py-1 rounded">🔄 {p.wagering}x çevrim</span>
                </div>
              </div>
              <button onClick={() => !claimed && claim(p._id)} disabled={claimed}
                className={`shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${claimed ? 'bg-bg-base text-text-3 cursor-not-allowed' : 'bg-success text-white hover:opacity-90'}`}>
                {claimed ? '✓ Kullanıldı' : 'Kullan'}
              </button>
            </div>
          );
        })}
        {!promos.length && <div className="text-center text-text-3 py-12">Aktif kampanya bulunamadı</div>}
      </div>
    </div>
  );
}
