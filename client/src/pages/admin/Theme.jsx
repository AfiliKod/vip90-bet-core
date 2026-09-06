import { useEffect, useState } from 'react';
import api from '../../services/api';
import { getChangedEntries, tokenCssVar } from '../../theme/editorLogic';
import { useTranslation } from '../../i18n';

/**
 * Görsel tema editörü (A2). GET /admin/theme ile tanım+güncel değer+kaynağı
 * çeker; bir token değiştirildiğinde hem taslağa yazar hem de anında
 * document.documentElement'e CSS custom property olarak enjekte eder —
 * kaydetmeden önce canlı önizleme budur. Kaydet, yalnızca gerçekten
 * değişmiş token'ları PATCH /admin/theme ile tek tek yazar.
 */
export default function AdminTheme() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [presets, setPresets] = useState([]);
  const [applyingPreset, setApplyingPreset] = useState(null);

  const TYPE_LABEL = {
    color: t('admin.theme.typeColor'),
    font: t('admin.theme.typeFont'),
    radius: t('admin.theme.typeRadius'),
    shadow: t('admin.theme.typeShadow'),
  };

  const SOURCE_BADGE = {
    db:      { label: t('admin.theme.sourceCustomized'), cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
    default: { label: t('admin.theme.sourceDefault'),     cls: 'bg-white/5 text-text-3 border-white/10' },
  };

  function load() {
    setLoading(true);
    api.get('/admin/theme')
      .then(r => setTokens(r.data.tokens))
      .catch(() => setNotice({ type: 'error', text: t('admin.theme.loadFailed') }))
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
      setNotice({ type: 'ok', text: t('admin.theme.presetApplied', { label: preset.label }) });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.theme.presetFailed') });
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
      setNotice({ type: 'ok', text: t('admin.theme.noChanges') });
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
      setNotice({ type: 'ok', text: t('admin.theme.savedCount', { count: changed.length }) });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.theme.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  function resetPreview() {
    // Kaydedilmemiş önizlemeyi geri al: sunucudaki güncel değerlere dön.
    for (const t2 of tokens) document.documentElement.style.setProperty(t2.cssVar, t2.value);
    setDraft({});
  }

  const changedCount = getChangedEntries(tokens, draft).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">🎨 {t('admin.theme.pageTitle')}</h1>
      <p className="text-text-3 text-sm mb-6">
        {t('admin.theme.pageHint')}
      </p>

      {notice && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${notice.type === 'ok' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-text-2 uppercase tracking-wide mb-2">{t('admin.theme.presetsTitle')}</h2>
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
                <div className="text-xs mt-2 text-primary">{applyingPreset === p.id ? t('admin.theme.applying') : t('admin.theme.apply')}</div>
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
          {tokens.map(tk => {
            const badge = SOURCE_BADGE[tk.source] || SOURCE_BADGE.default;
            const current = draft[tk.id] ?? tk.value;
            return (
              <div key={tk.id} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-1">{tk.id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="text-text-3 text-xs mt-0.5">{TYPE_LABEL[tk.type] || tk.type} · {tk.cssVar}</div>
                </div>
                {tk.type === 'color' ? (
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000'}
                    onChange={e => onChange(tk.id, e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer bg-transparent border border-white/10"
                  />
                ) : null}
                <input
                  type="text"
                  value={current}
                  onChange={e => onChange(tk.id, e.target.value)}
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
          {saving ? t('common.saving') : changedCount ? t('admin.theme.saveButtonCount', { count: changedCount }) : t('common.save')}
        </button>
        {changedCount > 0 && (
          <button onClick={resetPreview} className="text-text-3 text-sm px-4 py-2 hover:text-text-1">
            {t('admin.theme.resetPreview')}
          </button>
        )}
      </div>
    </div>
  );
}
