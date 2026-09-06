import { useEffect, useState } from 'react';
import api from '../../services/api';
import { validateBrandingFile } from '../../branding/fileValidation';
import { getChangedEntries } from '../../theme/editorLogic';

const SOURCE_BADGE = {
  db:      { label: 'Özelleştirildi', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  default: { label: 'Varsayılan',     cls: 'bg-white/5 text-text-3 border-white/10' },
};

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Marka kimliği editörü (A3): logo, favicon, site adı, özel font — hepsi
 * sunucuya SSH/FTP ile dosya kopyalamadan, panelden yüklenir. Dosyalar
 * tarayıcıda data: URL'e çevrilip PATCH /admin/branding ile JSON gövdede
 * gönderilir (bkz. server/src/app.js — bu uç için 1mb'lık ayrı body limiti).
 */
export default function AdminBranding() {
  const [fields, setFields] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  function load() {
    setLoading(true);
    api.get('/admin/branding')
      .then(r => setFields(r.data.fields))
      .catch(() => setNotice({ type: 'error', text: 'Marka ayarları yüklenemedi' }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function onTextChange(id, value) {
    setDraft(d => ({ ...d, [id]: value }));
  }

  async function onFileChange(field, e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için
    if (!file) return;
    const check = validateBrandingFile(file, field);
    if (!check.ok) {
      setNotice({ type: 'error', text: check.error });
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setDraft(d => ({ ...d, [field.id]: dataUrl }));
      setNotice(null);
    } catch {
      setNotice({ type: 'error', text: 'Dosya okunamadı' });
    }
  }

  async function save() {
    const changed = getChangedEntries(fields, draft);
    if (!changed.length) {
      setNotice({ type: 'ok', text: 'Değişiklik yok' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      for (const { id, value } of changed) {
        await api.patch('/admin/branding', { id, value });
      }
      setDraft({});
      load();
      setNotice({ type: 'ok', text: `${changed.length} alan kaydedildi` });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  }

  const changedCount = getChangedEntries(fields, draft).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">🏷️ Marka Kimliği</h1>
      <p className="text-text-3 text-sm mb-6">
        Logo, favicon, site adı ve özel font — sunucuya dosya kopyalamadan, doğrudan panelden.
      </p>

      {notice && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${notice.type === 'ok' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-16 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map(f => {
            const badge = SOURCE_BADGE[f.source] || SOURCE_BADGE.default;
            const current = draft[f.id] ?? f.value;
            return (
              <div key={f.id} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-1">{f.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                  </div>
                </div>

                {f.type === 'text' ? (
                  <input
                    type="text"
                    value={current || ''}
                    placeholder={f.id === 'siteName' ? 'Site Adınız' : "'Poppins', sans-serif"}
                    onChange={e => onTextChange(f.id, e.target.value)}
                    className="w-56 bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    {f.type === 'image' && current && (
                      <img src={current} alt={f.label} className="w-10 h-10 rounded object-contain bg-white/5" />
                    )}
                    <label className="text-sm bg-bg-base border border-white/10 rounded-lg px-3 py-2 cursor-pointer text-text-2 hover:text-text-1">
                      Dosya seç
                      <input
                        type="file"
                        accept={f.type === 'image' ? 'image/*' : '.woff,.woff2,.ttf,.otf'}
                        onChange={e => onFileChange(f, e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
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
      </div>
    </div>
  );
}
