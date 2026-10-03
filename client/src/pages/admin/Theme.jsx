import { useEffect, useState } from 'react';
import api from '../../services/api';
import { getChangedEntries, tokenCssVar } from '../../theme/editorLogic';
import { useTranslation } from '../../i18n';
import { ADMIN_BTN_GHOST, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';

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
    db:      { label: t('admin.theme.sourceCustomized'), cls: 'bg-success/15 text-success border-success/30' },
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
    <div className="max-w-3xl">
      <p className="text-text-3 text-sm mb-6">
        {t('admin.theme.pageHint')}
      </p>

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${notice.type === 'ok' ? 'border-success/30 bg-success/15 text-success' : 'border-danger/30 bg-danger/15 text-danger'}`}>
          {notice.text}
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">palette</span></span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.theme.presetsTitle')}</h3>
            <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">{presets.length}</span>
          </div>
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
                <div className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2 py-1 text-[11.5px] font-bold text-text-2">
                  <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">{applyingPreset === p.id ? 'progress_activity' : 'check'}</span>
                  {applyingPreset === p.id ? t('admin.theme.applying') : t('admin.theme.apply')}
                </div>
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
                    className="h-10 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  />
                ) : null}
                <input
                  type="text"
                  value={current}
                  onChange={e => onChange(tk.id, e.target.value)}
                  className="w-40 rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={saving || !changedCount}
          className={ADMIN_BTN_PRIMARY}
        >
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
          {saving ? t('common.saving') : changedCount ? t('admin.theme.saveButtonCount', { count: changedCount }) : t('common.save')}
        </button>
        {changedCount > 0 && (
          <button onClick={resetPreview} className={ADMIN_BTN_GHOST}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">undo</span>
            {t('admin.theme.resetPreview')}
          </button>
        )}
      </div>
    </div>
  );
}
