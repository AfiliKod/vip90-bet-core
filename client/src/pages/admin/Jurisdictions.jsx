import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

export default function Jurisdictions({ embedded = false }) {
  const { t, locale } = useTranslation();
  const [jurisdictions, setJurisdictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', complianceRules: '{}', isActive: true, isDefault: false });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const searchTimer = useRef(null);

  // Backend /admin/jurisdictions sayfalama + arama destekliyor.
  const loadJurisdictions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.isActive = status === 'active' ? 'true' : 'false';
      const [jurRes, statsRes] = await Promise.all([
        api.get('/admin/jurisdictions', { params }),
        api.get('/admin/jurisdictions/stats').catch(() => ({ data: null })),
      ]);
      setJurisdictions(jurRes.data.jurisdictions || jurRes.data || []);
      setTotal(jurRes.data.total ?? 0);
      setPages(jurRes.data.pages || 1);
      setStats(statsRes.data);
    } catch {
      setJurisdictions([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { loadJurisdictions(); }, [loadJurisdictions]);

  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const onTab = (key) => { setStatus(key); setPage(1); };

  function openCreate() {
    setForm({ name: '', code: '', description: '', complianceRules: '{}', isActive: true, isDefault: false });
    setModal('create');
  }

  function openEdit(jur) {
    setForm({
      name: jur.name || '',
      code: jur.code || '',
      description: jur.description || '',
      complianceRules: JSON.stringify(jur.complianceRules || {}, null, 2),
      isActive: jur.isActive !== false,
      isDefault: jur.isDefault || false,
    });
    setModal(jur);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const body = {
        ...form,
        complianceRules: JSON.parse(form.complianceRules || '{}'),
      };
      if (modal === 'create') {
        await api.post('/admin/jurisdictions', body);
      } else {
        await api.patch(`/admin/jurisdictions/${modal._id}`, body);
      }
      setNotice({ type: 'ok', text: t('admin.jurisdictions.saved') });
      setModal(null);
      loadJurisdictions();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.jurisdictions.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm(t('admin.jurisdictions.confirmDelete'))) return;
    setNotice(null);
    try {
      await api.delete(`/admin/jurisdictions/${id}`);
      setNotice({ type: 'ok', text: t('admin.jurisdictions.deleted') });
      loadJurisdictions();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.jurisdictions.deleteFailed') });
    }
  }

  const tabItems = [
    { key: 'all', label: t('common.all') },
    { key: 'active', label: t('admin.jurisdictions.active') },
    { key: 'inactive', label: t('admin.jurisdictions.inactive') },
  ];

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6'}>
      <AdminPageHeader
        embedded={embedded}
        crumbs={[{ label: t('admin.nav.groupCompliance') }, { label: t('admin.jurisdictions.title') }]}
        title={t('admin.jurisdictions.title')}
        sub={t('admin.jurisdictions.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
            {t('admin.jurisdictions.create')}
          </button>
        )}
      />

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {stats && (
        <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <AdminKpiCard label={t('admin.jurisdictions.statTotal')} value={String(stats.total ?? jurisdictions.length)} />
          <AdminKpiCard label={t('admin.jurisdictions.statActive')} value={String(stats.active ?? jurisdictions.filter(j => j.isActive !== false).length)} tone="text-success" />
          <AdminKpiCard label={t('admin.jurisdictions.statDefault')} value={stats.default || jurisdictions.find(j => j.isDefault)?.code || '—'} tone="text-primary" />
          <AdminKpiCard label={t('admin.jurisdictions.statPlayers')} value={String(stats.totalPlayers ?? '—')} />
        </section>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.jurisdictions.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        {/* Durum filtresi: Settings sekmesi içinde ikinci bir sekme çubuğu olmasın diye açılır liste */}
        <select
          value={status}
          onChange={e => onTab(e.target.value)}
          aria-label={t('common.status')}
          className="h-9 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] text-text-1 outline-none focus:border-white/25"
        >
          {tabItems.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => { clearTimeout(searchTimer.current); setSearch(''); onTab('all'); }}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      <AdminTable
        loading={loading}
        empty={jurisdictions.length === 0}
        emptyLabel={t('admin.jurisdictions.noJurisdictions')}
        columns={[
          { key: 'code', label: t('admin.jurisdictions.columnCode') },
          { key: 'name', label: t('admin.jurisdictions.columnName') },
          { key: 'rules', label: t('admin.jurisdictions.columnRules'), align: 'right' },
          { key: 'status', label: t('admin.jurisdictions.columnStatus') },
          { key: 'actions', label: t('admin.jurisdictions.columnActions'), align: 'right' },
        ]}
      >
        {jurisdictions.map(jur => (
          <AdminTableRow key={jur._id} className="cursor-pointer" onClick={() => openEdit(jur)}>
            <AdminTableCell>
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                  {String(jur.code || '?').slice(0, 2).toUpperCase()}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-bold text-text-1">{jur.code}</span>
                  {jur.isDefault && (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-[3px] text-[10.5px] font-extrabold uppercase text-primary">
                      {t('admin.jurisdictions.default')}
                    </span>
                  )}
                </div>
              </div>
            </AdminTableCell>
            <AdminTableCell><span className="text-text-2">{jur.name}</span></AdminTableCell>
            <AdminTableCell align="right">
              <span className="font-mono text-xs font-semibold tabular-nums text-text-2">
                {jur.complianceRules ? Object.keys(jur.complianceRules).length : 0} {t('admin.jurisdictions.rulesLabel')}
              </span>
            </AdminTableCell>
            <AdminTableCell>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                jur.isActive !== false ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
              }`}>
                {jur.isActive !== false ? t('admin.jurisdictions.active') : t('admin.jurisdictions.inactive')}
              </span>
            </AdminTableCell>
            <AdminTableActionsCell>
              <RowActions
                label={t('admin.jurisdictions.columnActions')}
                items={[
                  { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(jur) },
                  { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(jur._id) },
                ]}
              />
            </AdminTableActionsCell>
          </AdminTableRow>
        ))}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.jurisdictions.countLine', { count: total.toLocaleString(locale), page, pages })}
      />

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-card border border-white/10 rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-text-1 mb-4">
              {modal === 'create' ? t('admin.jurisdictions.createTitle') : t('admin.jurisdictions.editTitle')}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.jurisdictions.fieldCode')}</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary"
                  maxLength={10} placeholder="US-NJ" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.jurisdictions.fieldName')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary"
                  placeholder="New Jersey" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.jurisdictions.fieldDescription')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.jurisdictions.fieldComplianceRules')}</label>
                <textarea value={form.complianceRules} onChange={e => setForm(f => ({ ...f, complianceRules: e.target.value }))} rows={6}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm font-mono focus:outline-none focus:border-primary" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-text-3">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                  {t('admin.jurisdictions.fieldActive')}
                </label>
                <label className="flex items-center gap-2 text-xs text-text-3">
                  <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                  {t('admin.jurisdictions.fieldDefault')}
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button onClick={save} disabled={saving}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
