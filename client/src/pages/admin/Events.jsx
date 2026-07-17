import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';

const STATUS_COLOR = { live: 'text-live', finished: 'text-text-3', upcoming: 'text-success', cancelled: 'text-danger' };

function ActiveEvents() {
  const [events, setEvents] = useState([]);
  const [settling, setSettling] = useState(null);
  const addToast = useToastStore(s => s.add);
  const { register, handleSubmit } = useForm();

  const load = () => api.get('/events?full=1').then(r => setEvents(r.data.events)).catch(() => {});
  useEffect(() => { load(); }, []);

  const onSettle = async (eventId, data) => {
    try {
      const results = {};
      const score = data._score;
      Object.entries(data).forEach(([k, v]) => { if (k !== '_score' && v) results[k] = v; });
      await api.post(`/admin/events/${eventId}/settle`, { results, score });
      addToast('Etkinlik sonuçlandırıldı!', 'success');
      setSettling(null);
      load();
    } catch (e) { addToast(e.response?.data?.error?.message || 'Hata oluştu', 'error'); }
  };

  return (
    <div className="space-y-3">
      {events.map(e => (
        <div key={e._id} className="bg-bg-card border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div>
                <div className="text-sm font-medium text-text-1">{e.homeTeam.name} vs {e.awayTeam.name}</div>
                <div className="text-xs text-text-3 mt-0.5">{e.leagueFlag} {e.league}</div>
              </div>
              <span className={`text-xs font-semibold ${STATUS_COLOR[e.status] || ''}`}>{e.status}</span>
            </div>
            {e.status !== 'cancelled' && (
              <button onClick={() => setSettling(settling === e._id ? null : e._id)}
                className="px-3 py-1.5 bg-warning/20 text-warning border border-warning/30 rounded-lg text-xs hover:bg-warning/30 transition shrink-0 ml-2">
                Sonuçlandır
              </button>
            )}
          </div>
          {settling === e._id && (
            <form onSubmit={handleSubmit(d => onSettle(e._id, d))} className="mt-4 p-3 bg-bg-base rounded-lg space-y-2">
              <p className="text-xs text-text-3 mb-3">Her piyasa için kazanan seçeneği belirleyin:</p>
              {e.markets.map(m => (
                <div key={m.type} className="flex items-center gap-2">
                  <label className="text-xs text-text-2 w-36 shrink-0">{m.label}</label>
                  <select {...register(m.type)} className="flex-1 bg-bg-card border border-white/10 rounded px-2 py-1.5 text-xs text-text-1">
                    <option value="">Seçin...</option>
                    {m.odds.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <input {...register('_score')} placeholder="Skor (örn. 2-1)" className="w-full bg-bg-card border border-white/10 rounded px-3 py-1.5 text-xs text-text-1 mt-2" />
              <button type="submit" className="w-full py-2 bg-warning text-bg-deep font-semibold rounded-lg text-xs hover:opacity-90 transition mt-2">
                Onayla ve Sonuçlandır
              </button>
            </form>
          )}
        </div>
      ))}
      {!events.length && <div className="text-center text-text-3 py-12">Etkinlik bulunamadı</div>}
    </div>
  );
}

function ArchivedEvents() {
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = async (p = 1, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 30 });
      if (q) params.set('search', q);
      const r = await api.get(`/admin/events/archived?${params}`);
      setEvents(r.data.events);
      setTotal(r.data.total);
      setPages(r.data.pages);
      setPage(p);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(1, ''); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(1, search);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Takım veya lig ara..."
          className="flex-1 bg-bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/40"
        />
        <button type="submit" className="px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-sm hover:bg-primary/30 transition">
          Ara
        </button>
      </form>

      <p className="text-xs text-text-3 mb-2">Toplam {total} arşivli etkinlik</p>

      {loading && <div className="text-center text-text-3 py-8">Yükleniyor...</div>}

      {!loading && events.map(e => (
        <div key={e._id} className="bg-bg-card border border-white/5 rounded-xl p-4 opacity-80">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-1">{e.homeTeam.name} vs {e.awayTeam.name}</div>
              <div className="text-xs text-text-3 mt-0.5">{e.leagueFlag} {e.league}</div>
              {e.result?.score && (
                <div className="text-xs text-text-2 mt-1">Skor: <span className="font-semibold">{e.result.score}</span></div>
              )}
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className="text-xs text-text-3">
                {new Date(e.startTime).toLocaleDateString('tr-TR')}
              </div>
              <div className="text-xs text-text-3 mt-0.5">
                Arşiv: {new Date(e.archivedAt).toLocaleDateString('tr-TR')}
              </div>
              <span className="text-xs font-semibold text-text-3">{e.status}</span>
            </div>
          </div>
        </div>
      ))}

      {!loading && !events.length && (
        <div className="text-center text-text-3 py-12">Arşivlenmiş etkinlik bulunamadı</div>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 text-xs bg-bg-card border border-white/10 rounded-lg disabled:opacity-40 hover:bg-bg-hover transition">
            Geri
          </button>
          <span className="px-3 py-1.5 text-xs text-text-3">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1.5 text-xs bg-bg-card border border-white/10 rounded-lg disabled:opacity-40 hover:bg-bg-hover transition">
            İleri
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminEvents() {
  const [tab, setTab] = useState('active');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-text-1 mb-4">Etkinlik Yönetimi</h1>

      <div className="flex gap-1 mb-5 border-b border-white/10">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${tab === 'active' ? 'border-primary text-text-1' : 'border-transparent text-text-3 hover:text-text-2'}`}
        >
          Aktif Etkinlikler
        </button>
        <button
          onClick={() => setTab('archived')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${tab === 'archived' ? 'border-primary text-text-1' : 'border-transparent text-text-3 hover:text-text-2'}`}
        >
          Arşiv
        </button>
      </div>

      {tab === 'active' ? <ActiveEvents /> : <ArchivedEvents />}
    </div>
  );
}
