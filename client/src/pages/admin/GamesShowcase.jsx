import { useEffect, useState, useMemo } from 'react';
import api from '../../services/api';

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
 * Oyun arama havuzu, AdminPalace.jsx'in zaten kullandığı canlı
 * POST /palace/game/all ucundan gelir — ayrı bir oyun kataloğu icat
 * edilmedi.
 */
export default function AdminGamesShowcase() {
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
      api.post('/palace/game/all', { lang: 'tr' }).catch(() => ({ data: { data: [] } })),
    ]).then(([featuredRes, catalogRes]) => {
      const games = Array.isArray(catalogRes.data?.data) ? catalogRes.data.data : [];
      setCatalog(games);
      const byCode = Object.fromEntries(games.map(g => [g.game_code, g]));
      const codes = featuredRes.data?.codes || [];
      setFeatured(codes.map(code => byCode[code] || { game_code: code, game_name: code, provider_id: '?' }));
    }).catch(() => setNotice({ type: 'error', text: 'Yüklenemedi' }))
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
      setNotice({ type: 'ok', text: 'Kaydedildi' });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">⭐ Oyun Vitrini</h1>
      <p className="text-text-3 text-sm mb-6">
        "Öne Çıkanlar" kategorisinde görünecek oyunları seçin ve sıralayın.
      </p>

      {notice && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${notice.type === 'ok' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-14 animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Oyun ara (isim veya kod)…"
              className="w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-bg-card border border-white/10 rounded-lg max-h-64 overflow-y-auto">
                {searchResults.map(g => (
                  <button
                    key={g.game_code}
                    onClick={() => addGame(g)}
                    className="w-full text-left px-3 py-2 text-sm text-text-2 hover:bg-white/5 hover:text-text-1 flex justify-between gap-2"
                  >
                    <span className="truncate">{g.game_name || g.name}</span>
                    <span className="text-text-3 text-xs shrink-0">{g.provider_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {featured.length === 0 && (
              <p className="text-text-3 text-sm">Henüz oyun eklenmedi — yukarıdan arayıp ekleyin.</p>
            )}
            {featured.map((g, i) => (
              <div key={g.game_code} className="bg-bg-card border border-white/10 rounded-lg p-3 flex items-center gap-3">
                <span className="flex-1 text-sm text-text-1 truncate">{g.game_name || g.name || g.game_code}</span>
                <span className="text-text-3 text-xs">{g.provider_id}</span>
                <button onClick={() => moveGame(i, -1)} disabled={i === 0} className="text-text-3 hover:text-text-1 disabled:opacity-30 px-2">↑</button>
                <button onClick={() => moveGame(i, 1)} disabled={i === featured.length - 1} className="text-text-3 hover:text-text-1 disabled:opacity-30 px-2">↓</button>
                <button onClick={() => removeGame(g.game_code)} className="text-xs text-red-300 hover:text-red-200 px-2">Kaldır</button>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={saving || loading}
        className="bg-primary text-black font-semibold px-5 py-2 rounded-lg disabled:opacity-40"
      >
        {saving ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </div>
  );
}
