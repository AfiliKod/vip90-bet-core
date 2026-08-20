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

  function load() {
    setLoading(true);
    api.get('/admin/theme')
      .then(r => setTokens(r.data.tokens))
      .catch(() => setNotice({ type: 'error', text: 'Tema token\'ları yüklenemedi' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

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
