import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';

/**
 * M3 — Admin modül ekranı: aktivasyon, durum, yenileme.
 *
 * Modülün gerçekten kullanılabilir olması için iki kapı gerekir:
 * enabled (panel anahtarı) + licensed (lisans). Lisans 'cached' ise
 * merkez erişilemiyor demektir — son bilinen durumla çalışılıyor.
 */

const LICENSE_BADGE = {
  live:   { label: 'Lisans: doğrulandı', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  cached: { label: 'Lisans: önbellek (merkez erişilemiyor)', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  closed: { label: 'Lisans: doğrulanamadı', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

export default function AdminModules() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/admin/modules');
      setModules(r.data.modules ?? []);
    } catch {
      setError('Modül listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(m) {
    setBusyId(m.id);
    setError('');
    try {
      const r = await api.patch(`/admin/modules/${m.id}`, { enabled: !m.enabled });
      setModules(r.data.modules ?? []);
    } catch {
      setError(`"${m.title}" güncellenemedi.`);
    } finally {
      setBusyId(null);
    }
  }

  async function refresh() {
    setBusyId('refresh');
    try {
      const r = await api.post('/admin/modules/refresh');
      setModules(r.data.modules ?? []);
    } catch {
      setError('Yenileme başarısız.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Modüller</h1>
        <button
          onClick={refresh}
          disabled={busyId === 'refresh'}
          className="px-4 py-2 rounded-lg bg-bg-card border border-white/10 hover:border-primary/40 transition text-sm disabled:opacity-50"
        >
          {busyId === 'refresh' ? 'Yenileniyor…' : '↻ Durumu Yenile'}
        </button>
      </div>

      <p className="text-text-3 text-sm mb-6">
        Kapattığınız modülün menü ve sayfaları ziyaretçilere görünmez; çekirdek platform etkilenmez.
        Değişiklikler anında uygulanır.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-text-3">Yükleniyor…</div>
      ) : (
        <div className="space-y-3">
          {modules.map(m => {
            const badge = LICENSE_BADGE[m.licenseSource] ?? LICENSE_BADGE.closed;
            return (
              <div
                key={m.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-bg-card border border-white/10"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{m.title}</div>
                  {m.description && (
                    <div className="text-text-3 text-sm mt-0.5">{m.description}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {m.enabled && !m.licensed && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/30">
                        Lisanssız — ziyaretçilere kapalı
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => toggle(m)}
                  disabled={busyId === m.id}
                  role="switch"
                  aria-checked={m.enabled}
                  aria-label={`${m.title} modülünü ${m.enabled ? 'kapat' : 'aç'}`}
                  className={`relative w-12 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${
                    m.enabled ? 'bg-green-500/80' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      m.enabled ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
