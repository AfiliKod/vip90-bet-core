import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

const COLUMN_LABELS = { brand: 'admin.staticPages.colBrand', support: 'admin.staticPages.colSupport', legal: 'admin.staticPages.colLegal' };

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
    <div>
      <p className="text-text-3 text-sm mb-6">{t('admin.staticPages.subtitle')}</p>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <AdminTable
        loading={loading}
        empty={pages.length === 0}
        emptyLabel={t('common.noData')}
        columns={[
          { key: 'page', label: t('admin.staticPages.columnPage') },
          { key: 'group', label: t('admin.staticPages.columnGroup') },
          { key: 'status', label: t('admin.staticPages.columnStatus') },
          { key: 'actions', label: t('admin.staticPages.columnActions'), align: 'right' },
        ]}
      >
        {groups.map(group =>
          pages.filter(p => p.footerColumn === group).map(p => (
            <AdminTableRow key={p.slug}>
              <AdminTableCell>
                <div className="truncate font-bold text-text-1">{p.title}</div>
                <div className="mt-0.5 font-mono text-xs text-text-3">{p.route}</div>
              </AdminTableCell>
              <AdminTableCell>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-text-2">
                  {t(COLUMN_LABELS[group])}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                {p.isEnabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-extrabold text-success">
                    <i className="h-1.5 w-1.5 rounded-full bg-success" />
                    {t('admin.staticPages.enabled')}
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-extrabold text-text-3">
                    {t('admin.staticPages.disabled')}
                  </span>
                )}
              </AdminTableCell>
              <AdminTableActionsCell>
                <RowActions
                  label={t('admin.staticPages.columnActions')}
                  items={[
                    { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(p) },
                    { key: 'toggle', label: p.isEnabled ? t('admin.staticPages.disable') : t('admin.staticPages.enable'), icon: p.isEnabled ? 'toggle_off' : 'toggle_on', onClick: () => toggle(p) },
                  ]}
                />
              </AdminTableActionsCell>
            </AdminTableRow>
          )),
        )}
      </AdminTable>

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
                    <button onClick={() => removeSection(sIdx)} className="text-danger px-2" aria-label={t('common.delete')}>
                      <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">close</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    {section.content.map((p, pIdx) => (
                      <div key={pIdx} className="flex items-center gap-2">
                        <textarea value={p} rows={2}
                          onChange={e => updateParagraph(sIdx, pIdx, e.target.value)}
                          className="flex-1 rounded-lg bg-bg-base border border-white/10 px-2 py-1.5 text-xs text-text-1" />
                        <button onClick={() => removeParagraph(sIdx, pIdx)} className="text-danger px-1" aria-label={t('common.delete')}>
                          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">close</span>
                        </button>
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
