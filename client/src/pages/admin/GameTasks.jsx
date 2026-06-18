import { useEffect, useState } from 'react';
import api from '../../services/api';

const STATUS_LABELS = {
  pending:  { label: 'Bekliyor', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  resolved: { label: 'Çözüldü', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  ignored:  { label: 'Görmezden Gelindi', cls: 'bg-white/5 text-text-3 border-white/10' },
};

export default function AdminGameTasks() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/tasks?status=${filter}`)
      .then(r => setTasks(r.data.tasks))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  async function updateStatus(id, status) {
    const r = await api.patch(`/admin/tasks/${id}`, { status, notes: notes[id] || '' });
    setTasks(prev => prev.map(t => t._id === id ? r.data.task : t));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-1">🎰 Oyun Görevleri</h1>
        <div className="flex gap-2">
          {['pending', 'resolved', 'ignored'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                filter === s
                  ? STATUS_LABELS[s].cls
                  : 'text-text-3 border-white/10 hover:text-text-2'
              }`}>
              {STATUS_LABELS[s].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center text-text-3 py-16">Görev bulunamadı</div>
      ) : (
        <div className="space-y-3">
          {tasks.map(t => {
            const s = STATUS_LABELS[t.status];
            return (
              <div key={t._id} className="bg-bg-card border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold border rounded px-1.5 py-0.5 ${s.cls}`}>
                        {s.label}
                      </span>
                      <span className="text-xs text-text-3 font-mono">{t.gameId}</span>
                    </div>
                    <p className="text-sm font-semibold text-text-1 truncate">{t.gameTitle || t.gameId}</p>
                    <p className="text-xs text-text-3 mt-0.5">
                      {t.provider} · {new Date(t.detectedAt).toLocaleString('tr-TR')}
                    </p>
                    {t.notes && (
                      <p className="text-xs text-text-2 mt-1 italic">"{t.notes}"</p>
                    )}
                  </div>

                  {t.status === 'pending' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <input
                        value={notes[t._id] || ''}
                        onChange={e => setNotes(prev => ({ ...prev, [t._id]: e.target.value }))}
                        placeholder="Not ekle (opsiyonel)"
                        className="bg-bg-base border border-white/10 rounded px-2 py-1 text-xs text-text-1 w-44 focus:outline-none focus:border-primary/50"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateStatus(t._id, 'resolved')}
                          className="flex-1 px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition">
                          Çözüldü
                        </button>
                        <button
                          onClick={() => updateStatus(t._id, 'ignored')}
                          className="flex-1 px-2 py-1 rounded text-xs font-medium bg-white/5 text-text-3 border border-white/10 hover:text-text-2 transition">
                          Yoksay
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
