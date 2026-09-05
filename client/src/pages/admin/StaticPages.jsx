import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

const COLUMN_LABELS = { brand: 'Marka (Hakkımızda vb.)', support: 'Destek', legal: 'Yasal' };

/**
 * Footer/statik sayfa yönetimi. Hakkımızda/Kariyer/Basın/İletişim (yeni) +
 * Yasal sayfalar + Sorumlu Oyun (mevcut, artık DB'den) — admin panelinden
 * düzenlenebilir ve açılıp/kapatılabilir. `isEnabled:false` olan sayfalar
 * footer'dan gizlenir, doğrudan URL'e gidilirse boş-durum gösterilir.
 */
export default function AdminStaticPages() {
  const { t } = useTranslation();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { slug, title, intro, sections }

  function load() {
    setError('');
    api.get('/admin/static-pages')
      .then(r => setPages(r.data.pages))
      .catch(() => setError(t('admin.staticPages.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggle(page) {
    setError('');
    try {
      await api.patch(`/admin/static-pages/${page.slug}/toggle`, { isEnabled: !page.isEnabled });
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.staticPages.saveError'));
    }
  }

  function openEdit(page) {
    setEditing({
      slug: page.slug,
      title: page.title,
      intro: page.intro || '',
      sections: page.sections.map(s => ({ title: s.title, content: [...s.content] })),
    });
  }

  function addSection() {
    setEditing(e => ({ ...e, sections: [...e.sections, { title: '', content: [''] }] }));
  }

  function removeSection(idx) {
    setEditing(e => ({ ...e, sections: e.sections.filter((_, i) => i !== idx) }));
  }

  function updateSectionTitle(idx, title) {
    setEditing(e => ({ ...e, sections: e.sections.map((s, i) => i === idx ? { ...s, title } : s) }));
  }

  function addParagraph(sectionIdx) {
    setEditing(e => ({
      ...e,
      sections: e.sections.map((s, i) => i === sectionIdx ? { ...s, content: [...s.content, ''] } : s),
    }));
  }

  function removeParagraph(sectionIdx, pIdx) {
    setEditing(e => ({
      ...e,
      sections: e.sections.map((s, i) => i === sectionIdx ? { ...s, content: s.content.filter((_, j) => j !== pIdx) } : s),
    }));
  }

  function updateParagraph(sectionIdx, pIdx, value) {
    setEditing(e => ({
      ...e,
      sections: e.sections.map((s, i) => i === sectionIdx
        ? { ...s, content: s.content.map((p, j) => j === pIdx ? value : p) }
        : s),
    }));
  }

  async function save() {
    setError('');
    try {
      await api.put(`/admin/static-pages/${editing.slug}`, {
        title: editing.title,
        intro: editing.intro,
        sections: editing.sections
          .filter(s => s.title.trim())
          .map(s => ({ title: s.title, content: s.content.filter(p => p.trim()) })),
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.staticPages.saveError'));
    }
  }

  const groups = ['brand', 'support', 'legal'];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t('admin.staticPages.title')}</h1>
      <p className="text-text-3 text-sm mb-6">{t('admin.staticPages.subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-text-3">{t('admin.staticPages.loading')}</div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group}>
              <div className="text-xs uppercase tracking-widest text-text-3 font-bold mb-3">{COLUMN_LABELS[group]}</div>
              <div className="space-y-2">
                {pages.filter(p => p.footerColumn === group).map(p => (
                  <div key={p.slug} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {p.title}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.isEnabled ? 'bg-green-500/15 text-green-300' : 'bg-white/5 text-text-3'}`}>
                          {p.isEnabled ? t('admin.staticPages.enabled') : t('admin.staticPages.disabled')}
                        </span>
                      </div>
                      <div className="text-xs text-text-3 mt-0.5">{p.route}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                        {t('common.edit')}
                      </button>
                      <button onClick={() => toggle(p)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                        {p.isEnabled ? t('admin.staticPages.disable') : t('admin.staticPages.enable')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        // items-center YERİNE items-start: içerik viewport'tan uzun olduğunda
        // (çoğu madde/paragraf içeren sayfalarda hep böyle) flex+items-center
        // ile overflow-y-auto birleşince tarayıcı scrollTop=0'ı içeriğin
        // ORTASI gibi konumlandırıyordu — modal 1. madde yerine 3-4. maddeden
        // açılmış gibi görünüyordu. items-start ile scrollTop=0 gerçekten
        // içeriğin en üstünü (1. madde) gösterir.
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">{t('admin.staticPages.editTitle')}</h2>

            <label className="text-xs text-text-3 block mb-3">
              {t('admin.staticPages.titleField')}
              <input value={editing.title}
                onChange={e => setEditing(ed => ({ ...ed, title: e.target.value }))}
                className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
            </label>

            <label className="text-xs text-text-3 block mb-4">
              {t('admin.staticPages.introField')}
              <textarea value={editing.intro} rows={2}
                onChange={e => setEditing(ed => ({ ...ed, intro: e.target.value }))}
                className="mt-1 w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1" />
            </label>

            <div className="space-y-4 mb-4">
              {editing.sections.map((section, sIdx) => (
                <div key={sIdx} className="border border-white/10 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input value={section.title} placeholder={t('admin.staticPages.sectionTitleField')}
                      onChange={e => updateSectionTitle(sIdx, e.target.value)}
                      className="flex-1 h-8 rounded-lg bg-bg-base border border-white/10 px-2 text-sm text-text-1" />
                    <button onClick={() => removeSection(sIdx)} className="text-xs text-red-300 px-2">✕</button>
                  </div>
                  <div className="space-y-2">
                    {section.content.map((p, pIdx) => (
                      <div key={pIdx} className="flex items-center gap-2">
                        <textarea value={p} rows={2}
                          onChange={e => updateParagraph(sIdx, pIdx, e.target.value)}
                          className="flex-1 rounded-lg bg-bg-base border border-white/10 px-2 py-1.5 text-xs text-text-1" />
                        <button onClick={() => removeParagraph(sIdx, pIdx)} className="text-xs text-red-300 px-1">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addParagraph(sIdx)} className="mt-2 text-xs text-primary">
                    + {t('admin.staticPages.addParagraph')}
                  </button>
                </div>
              ))}
              <button onClick={addSection} className="text-xs text-primary">
                + {t('admin.staticPages.addSection')}
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">{t('common.save')}</button>
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-white/10 text-text-2 text-sm">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
