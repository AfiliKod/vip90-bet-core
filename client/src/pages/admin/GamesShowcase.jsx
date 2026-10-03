import { useEffect, useState, useMemo } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';

function move(list, index, dir) {
  const to = index + dir;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * Oyun vitrini editörü (A5): admin panelinden yönetilen "Öne Çıkanlar"
 * listesi — CasinoRedesign.jsx'teki yeni 'featured' kategorisi bunu
 * GET /api/games/featured'tan okur. Kategori (all/popular/new/slots/inhouse)
 * zaten sabit kodlu var; burada eklenen tek şey sırası önemli, admin
 * curation'lı bir oyun listesi.
 *
 * Oyun arama havuzu, AdminIgames.jsx'in zaten kullandığı canlı
 * POST /igames/game/all ucundan gelir — ayrı bir oyun kataloğu icat
 * edilmedi.
 */
export default function AdminGamesShowcase() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [featured, setFeatured] = useState([]); // [{game_code, game_name, provider_id}]
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');

  function load() {
    setLoading(true);
    Promise.all([
      api.get('/admin/games/featured'),
      api.post('/igames/game/all', { lang: 'tr' }).catch(() => ({ data: { data: [] } })),
    ]).then(([featuredRes, catalogRes]) => {
      const games = Array.isArray(catalogRes.data?.data) ? catalogRes.data.data : [];
      setCatalog(games);
      const byCode = Object.fromEntries(games.map(g => [g.game_code, g]));
      const codes = featuredRes.data?.codes || [];
      setFeatured(codes.map(code => byCode[code] || { game_code: code, game_name: code, provider_id: '?' }));
    }).catch(() => setNotice({ type: 'error', text: t('admin.gamesShowcase.loadFailed') }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const featuredCodes = useMemo(() => new Set(featured.map(g => g.game_code)), [featured]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return catalog
      .filter(g => !featuredCodes.has(g.game_code))
      .filter(g => (g.game_name || g.name || '').toLowerCase().includes(q) || (g.game_code || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [catalog, query, featuredCodes]);

  function addGame(g) {
    setFeatured(prev => [...prev, g]);
    setQuery('');
  }

  function removeGame(code) {
    setFeatured(prev => prev.filter(g => g.game_code !== code));
  }

  function moveGame(index, dir) {
    setFeatured(prev => move(prev, index, dir));
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await api.patch('/admin/games/featured', { codes: featured.map(g => g.game_code) });
      setNotice({ type: 'ok', text: t('admin.gamesShowcase.saved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.gamesShowcase.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  // IA birleştirmesi: bu artık Igames.jsx'in bir alt-tab'ı (bkz. denetim
  // raporu) — kendi başlığı/dış wrapper'ı kaldırıldı, Igames.jsx'in tab
  // bar'ı zaten bağlamı veriyor. Eski bağımsız route (/admin/games-showcase)
  // artık App.jsx'te /admin/igames?tab=showcase'e redirect ediyor, bu
  // component'e başka hiçbir yoldan erişilmiyor.
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-text-3 mb-5">
        {t('admin.gamesShowcase.pageHint')}
      </p>

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-14 animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="relative mb-5">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 !text-[18px] text-text-3" aria-hidden="true">search</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('admin.gamesShowcase.searchPlaceholder')}
              className="w-full rounded-lg border border-white/10 bg-bg-deep py-2.5 pl-9 pr-3 text-sm text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-bg-card">
                {searchResults.map(g => (
                  <button
                    key={g.game_code}
                    onClick={() => addGame(g)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-text-2 transition hover:bg-bg-hover hover:text-text-1"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="material-symbols-outlined !text-[15px] text-success" aria-hidden="true">add_circle</span>
                      <span className="truncate">{g.game_name || g.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-text-3">{g.provider_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.gamesShowcase.featuredTitle')}</h3>
            <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">{featured.length}</span>
          </div>

          <div className="space-y-2 mb-6">
            {featured.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-10 text-center">
                <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">star</span>
                <p className="mt-2 text-sm text-text-3">{t('admin.gamesShowcase.emptyState')}</p>
              </div>
            )}
            {featured.map((g, i) => (
              <div key={g.game_code} className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-card p-3">
                <span className="material-symbols-outlined !text-[16px] text-text-3/70" aria-hidden="true">drag_indicator</span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-1">{g.game_name || g.name || g.game_code}</span>
                <span className="hidden shrink-0 rounded-full bg-white/5 px-2 py-[3px] font-mono text-[10.5px] font-bold text-text-3 sm:inline">{g.provider_id}</span>
                <button
                  onClick={() => moveGame(i, -1)}
                  disabled={i === 0}
                  aria-label={t('common.moveUp')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1 disabled:opacity-30"
                >
                  <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">arrow_upward</span>
                </button>
                <button
                  onClick={() => moveGame(i, 1)}
                  disabled={i === featured.length - 1}
                  aria-label={t('common.moveDown')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1 disabled:opacity-30"
                >
                  <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">arrow_downward</span>
                </button>
                <button
                  onClick={() => removeGame(g.game_code)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20"
                >
                  <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">remove_circle</span>
                  {t('admin.gamesShowcase.remove')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={saving || loading}
        className={ADMIN_BTN_PRIMARY}
      >
        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  );
}
