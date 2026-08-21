import { useEffect, useState } from 'react';
import api from '../../services/api';
import { getChangedEntries, tokenCssVar } from '../../theme/editorLogic';

const TYPE_LABEL = { color: 'Renk', font: 'Yazı Tipi', radius: 'Köşe Yarıçapı', shadow: 'Gölge' };

const SOURCE_BADGE = {
  db:      { label: 'Özelleştirildi', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  default: { label: 'Varsayılan',     cls: 'bg-white/5 text-text-3 border-white/10' },
};

/**
 * Görsel tema editörü (A2). GET /admin/theme ile tanım+güncel değer+kaynağı
 * çeker; bir token değiştirildiğinde hem taslağa yazar hem de anında
 * document.documentElement'e CSS custom property olarak enjekte eder —
 * kaydetmeden önce canlı önizleme budur. Kaydet, yalnızca gerçekten
 * değişmiş token'ları PATCH /admin/theme ile tek tek yazar.
 */
export default function AdminTheme() {
  const [tokens, setTokens] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [presets, setPresets] = useState([]);
  const [applyingPreset, setApplyingPreset] = useState(null);

  function load() {
    setLoading(true);
    api.get('/admin/theme')
      .then(r => setTokens(r.data.tokens))
      .catch(() => setNotice({ type: 'error', text: 'Tema token\'ları yüklenemedi' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/admin/theme/presets').then(r => setPresets(r.data.presets)).catch(() => {});
  }, []);

  async function applyPreset(preset) {
    setApplyingPreset(preset.id);
    setNotice(null);
    // Canlı önizleme: sunucu yanıtını beklemeden paketin tüm token'larını enjekte et.
    for (const [tokenId, value] of Object.entries(preset.tokens)) {
      const cssVar = tokenCssVar(tokens, tokenId);
      if (cssVar) document.documentElement.style.setProperty(cssVar, value);
    }
    try {
      await api.post('/admin/theme/apply-preset', { id: preset.id });
      setDraft({});
      load();
      setNotice({ type: 'ok', text: `"${preset.label}" uygulandı` });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Paket uygulanamadı' });
    } finally {
      setApplyingPreset(null);
    }
  }

  function preview(id, value) {
    const cssVar = tokenCssVar(tokens, id);
    if (cssVar) document.documentElement.style.setProperty(cssVar, value);
  }

  function onChange(id, value) {
    setDraft(d => ({ ...d, [id]: value }));
    preview(id, value);
  }

  async function save() {
    const changed = getChangedEntries(tokens, draft);
    if (!changed.length) {
      setNotice({ type: 'ok', text: 'Değişiklik yok' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      for (const { id, value } of changed) {
        await api.patch('/admin/theme', { id, value });
      }
      setDraft({});
      load();
      setNotice({ type: 'ok', text: `${changed.length} token kaydedildi` });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  }

  function resetPreview() {
    // Kaydedilmemiş önizlemeyi geri al: sunucudaki güncel değerlere dön.
    for (const t of tokens) document.documentElement.style.setProperty(t.cssVar, t.value);
    setDraft({});
  }

  const changedCount = getChangedEntries(tokens, draft).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">🎨 Tema Editörü</h1>
      <p className="text-text-3 text-sm mb-6">
        Renk, yazı tipi ve köşe değerlerini değiştirin — değişiklik anında bu sayfada
        önizlenir, kaydedince tüm sitede geçerli olur.
      </p>

      {notice && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${notice.type === 'ok' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-text-2 uppercase tracking-wide mb-2">Hazır Temalar</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {presets.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                disabled={applyingPreset === p.id}
                className="bg-bg-card border border-white/10 rounded-xl p-4 text-left hover:border-primary/40 transition disabled:opacity-50"
              >
                <div className="flex gap-1 mb-2">
                  <span className="w-6 h-6 rounded-full border border-white/20" style={{ background: p.tokens.primary }} />
                  <span className="w-6 h-6 rounded-full border border-white/20" style={{ background: p.tokens.accent }} />
                </div>
                <div className="text-sm font-semibold text-text-1">{p.label}</div>
                <div className="text-text-3 text-xs mt-0.5">{p.description}</div>
                <div className="text-xs mt-2 text-primary">{applyingPreset === p.id ? 'Uygulanıyor…' : 'Uygula →'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-16 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map(t => {
            const badge = SOURCE_BADGE[t.source] || SOURCE_BADGE.default;
            const current = draft[t.id] ?? t.value;
            return (
              <div key={t.id} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-1">{t.id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="text-text-3 text-xs mt-0.5">{TYPE_LABEL[t.type] || t.type} · {t.cssVar}</div>
                </div>
                {t.type === 'color' ? (
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000'}
                    onChange={e => onChange(t.id, e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer bg-transparent border border-white/10"
                  />
                ) : null}
                <input
                  type="text"
                  value={current}
                  onChange={e => onChange(t.id, e.target.value)}
                  className="w-40 bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={save}
          disabled={saving || !changedCount}
          className="bg-primary text-black font-semibold px-5 py-2 rounded-lg disabled:opacity-40"
        >
          {saving ? 'Kaydediliyor…' : changedCount ? `Kaydet (${changedCount})` : 'Kaydet'}
        </button>
        {changedCount > 0 && (
          <button onClick={resetPreview} className="text-text-3 text-sm px-4 py-2 hover:text-text-1">
            Önizlemeyi geri al
          </button>
        )}
      </div>
    </div>
  );
}
