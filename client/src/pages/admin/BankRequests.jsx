import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';

export default function AdminBankRequests() {
  const [requests, setRequests] = useState([]);
  const [type, setType] = useState('deposit');
  const [loading, setLoading] = useState(true);
  const addToast = useToastStore(s => s.add);

  const load = (t) => {
    setLoading(true);
    api.get(`/bank/admin/pending?type=${t}`)
      .then(r => setRequests(r.data.requests))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(type); }, [type]);

  const approve = async (id) => {
    try {
      await api.patch(`/bank/admin/pending/${id}/approve`);
      addToast('Talep onaylandı', 'success');
      load(type);
    } catch (e) { addToast(e.response?.data?.error || 'Hata', 'error'); }
  };

  const reject = async (id) => {
    const note = prompt('Reddetme sebebi (opsiyonel):');
    try {
      await api.patch(`/bank/admin/pending/${id}/reject`, { note: note || '' });
      addToast('Talep reddedildi', 'info');
      load(type);
    } catch (e) { addToast(e.response?.data?.error || 'Hata', 'error'); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-text-1 mb-4">🏦 Banka Talep Onayı</h1>

      <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit mb-4">
        {[
          { key: 'deposit', label: '📥 Yatırma Talepleri' },
          { key: 'withdraw', label: '📤 Çekme Talepleri' },
        ].map(t => (
          <button key={t.key} onClick={() => setType(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${type === t.key ? 'bg-accent text-white' : 'text-text-3 hover:text-text-1'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-text-3 py-8 text-sm">Yükleniyor...</div>
      ) : requests.length === 0 ? (
        <div className="text-center text-text-3 py-8 text-sm">Bekleyen talep yok</div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r._id} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-text-1">{r.userId?.username || '???'}</span>
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-text-3">
                    {r.userId?.email}
                  </span>
                </div>
                <div className="text-2xl font-black text-primary">
                  ₺{r.amount.toFixed(2)}
                </div>
                <div className="text-xs text-text-3 mt-1">
                  {new Date(r.createdAt).toLocaleString('tr-TR')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => reject(r._id)}
                  className="px-4 py-2 border border-danger/40 text-danger rounded-lg text-sm font-medium hover:bg-danger/10 transition">
                  Reddet
                </button>
                <button onClick={() => approve(r._id)}
                  className="px-4 py-2 bg-success text-white rounded-lg text-sm font-semibold hover:opacity-90 transition">
                  Onayla
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
