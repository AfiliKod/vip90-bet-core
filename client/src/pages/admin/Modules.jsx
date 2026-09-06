import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

/**
 * M3 — Admin modül ekranı: aktivasyon, durum, yenileme.
 *
 * Modülün gerçekten kullanılabilir olması için iki kapı gerekir:
 * enabled (panel anahtarı) + licensed (lisans). Lisans 'cached' ise
 * merkez erişilemiyor demektir — son bilinen durumla çalışılıyor.
 */

export default function AdminModules() {
  const { t } = useTranslation();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const LICENSE_BADGE = {
    live:   { label: t('admin.modules.licenseLive'), cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
    cached: { label: t('admin.modules.licenseCached'), cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    closed: { label: t('admin.modules.licenseClosed'), cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/admin/modules');
      setModules(r.data.modules ?? []);
    } catch {
      setError(t('admin.modules.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function toggle(m) {
    setBusyId(m.id);
    setError('');
    try {
      const r = await api.patch(`/admin/modules/${m.id}`, { enabled: !m.enabled });
      setModules(r.data.modules ?? []);
    } catch {
      setError(t('admin.modules.updateFailed', { title: m.title }));
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
      setError(t('admin.modules.refreshFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('admin.modules.title')}</h1>
        <button
          onClick={refresh}
          disabled={busyId === 'refresh'}
          className="px-4 py-2 rounded-lg bg-bg-card border border-white/10 hover:border-primary/40 transition text-sm disabled:opacity-50"
        >
          {busyId === 'refresh' ? t('admin.modules.refreshing') : t('admin.modules.refreshButton')}
        </button>
      </div>

      <p className="text-text-3 text-sm mb-6">
        {t('admin.modules.hint')}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-text-3">{t('common.loading')}</div>
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
                        {t('admin.modules.unlicensed')}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => toggle(m)}
                  disabled={busyId === m.id}
                  role="switch"
                  aria-checked={m.enabled}
                  aria-label={t('admin.modules.toggleAriaLabel', { title: m.title, action: m.enabled ? t('admin.modules.toggleOff') : t('admin.modules.toggleOn') })}
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
