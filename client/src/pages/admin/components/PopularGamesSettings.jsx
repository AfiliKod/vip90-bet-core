// Casino Provider → Popular games: popüler oyun listesi (sıralı).
// Eskiden Modules.jsx > IgamesModuleBody içindeydi; API base/token/callback
// ve varsayılan dil Modules'ta kalır.
import { useEffect, useState } from 'react';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToastStore } from '../../../store/toastStore';

export default function PopularGamesSettings() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, catalogRes] = await Promise.all([
          api.get('/admin/igames/module-settings'),
          api.post('/igames/game/all', { lang: 'tr' }).catch(() => ({ data: { data: [] } })),
        ]);
        setSelectedCodes(settingsRes.data.popularGameCodes || []);
        setCatalog(catalogRes.data?.data || []);
      } catch {
        addToast(t('admin.moduleCards.igamesLoadFailed'), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast, t]);

  function toggleGame(code) {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  function moveGame(code, dir) {
    setSelectedCodes(prev => {
      const idx = prev.indexOf(code);
      const next = [...prev];
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  async function savePopularGames() {
    setSaving(true);
    try {
      await api.patch('/admin/igames/module-settings', { popularGameCodes: selectedCodes });
      addToast(t('admin.moduleCards.popularGamesUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const filteredCatalog = catalog.filter(g =>
    !search || g.game_name?.toLowerCase().includes(search.toLowerCase()) || g.game_code?.includes(search)
  ).slice(0, 60);

  const byCode = new Map(catalog.map(g => [g.game_code, g]));

  if (loading) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  return (
    <div className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wide text-text-3">
          {t('admin.moduleCards.popularGames', { count: selectedCodes.length })}
        </div>
        <button
          onClick={savePopularGames}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition disabled:opacity-50"
        >
          {saving ? t('admin.moduleCards.saving') : t('admin.moduleCards.saveList')}
        </button>
      </div>

      {selectedCodes.length > 0 && (
        <div className="mb-3 space-y-1">
          {selectedCodes.map((code, i) => (
            <div key={code} className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
              <span className="text-text-3 w-5">{i + 1}.</span>
              <span className="flex-1 truncate text-text-1">{byCode.get(code)?.game_name || code}</span>
              <button onClick={() => moveGame(code, -1)} disabled={i === 0} className="text-text-3 hover:text-text-1 disabled:opacity-20 px-1">↑</button>
              <button onClick={() => moveGame(code, 1)} disabled={i === selectedCodes.length - 1} className="text-text-3 hover:text-text-1 disabled:opacity-20 px-1">↓</button>
              <button onClick={() => toggleGame(code)} className="text-danger hover:text-danger px-1" aria-label={t('common.remove')}>
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder={t('admin.moduleCards.searchGame')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 mb-2"
      />
      <div className="max-h-64 overflow-y-auto space-y-1 border border-white/10 rounded-lg p-2">
        {filteredCatalog.length === 0 && <div className="text-text-3 text-xs p-2">{t('admin.moduleCards.noResults')}</div>}
        {filteredCatalog.map(g => (
          <label key={g.game_code} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedCodes.includes(g.game_code)}
              onChange={() => toggleGame(g.game_code)}
              className="accent-primary"
            />
            <span className="text-text-1">{g.game_name || g.game_code}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
