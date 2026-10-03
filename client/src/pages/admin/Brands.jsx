import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

export default function Brands({ embedded = false }) {
  const { t, locale } = useTranslation();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', logo: '', favicon: '', domains: [], themeOverrides: '{}', isActive: true });
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const searchTimer = useRef(null);

  // Backend /admin/brands sayfalama + arama destekliyor (page/limit/isActive/search).
  // Önceden tüm veri çekilip client-side filtreleniyordu.
  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.isActive = status === 'active' ? 'true' : 'false';
      const [brandsRes, statsRes] = await Promise.all([
        api.get('/admin/brands', { params }),
        api.get('/admin/brands/stats').catch(() => ({ data: null })),
      ]);
      setBrands(brandsRes.data.brands || brandsRes.data || []);
      setTotal(brandsRes.data.total ?? 0);
      setPages(brandsRes.data.pages || 1);
      setStats(statsRes.data);
    } catch {
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  // 300 ms debounce — Users deseni.
  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const onTab = (key) => { setStatus(key); setPage(1); };

  function openCreate() {
    setForm({ name: '', slug: '', description: '', logo: '', favicon: '', domains: [], themeOverrides: '{}', isActive: true });
    setModal('create');
  }

  function openEdit(brand) {
    setForm({
      name: brand.name || '',
      slug: brand.slug || '',
      description: brand.description || '',
      logo: brand.logo || '',
      favicon: brand.favicon || '',
      domains: brand.domains || [],
      themeOverrides: JSON.stringify(brand.themeOverrides || {}, null, 2),
      isActive: brand.isActive !== false,
    });
    setModal(brand);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const body = {
        ...form,
        themeOverrides: JSON.parse(form.themeOverrides || '{}'),
      };
      if (modal === 'create') {
        await api.post('/admin/brands', body);
      } else {
        await api.patch(`/admin/brands/${modal._id}`, body);
      }
      setNotice({ type: 'ok', text: t('admin.brands.saved') });
      setModal(null);
      loadBrands();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.brands.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm(t('admin.brands.confirmDelete'))) return;
    setNotice(null);
    try {
      await api.delete(`/admin/brands/${id}`);
      setNotice({ type: 'ok', text: t('admin.brands.deleted') });
      loadBrands();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.brands.deleteFailed') });
    }
  }

  async function addDomain() {
    if (!newDomain.trim() || modal === 'create') return;
    setNotice(null);
    try {
      await api.post(`/admin/brands/${modal._id}/domains`, { domain: newDomain.trim() });
      setForm(f => ({ ...f, domains: [...(f.domains || []), newDomain.trim()] }));
      setNewDomain('');
      setNotice({ type: 'ok', text: t('admin.brands.domainAdded') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.brands.domainAddFailed') });
    }
  }

  async function removeDomain(domain) {
    if (modal === 'create') return;
    setNotice(null);
    try {
      await api.delete(`/admin/brands/${modal._id}/domains/${domain}`);
      setForm(f => ({ ...f, domains: (f.domains || []).filter(d => d !== domain) }));
      setNotice({ type: 'ok', text: t('admin.brands.domainRemoved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.brands.domainRemoveFailed') });
    }
  }

  const tabItems = [
    { key: 'all', label: t('common.all') },
    { key: 'active', label: t('admin.brands.active') },
    { key: 'inactive', label: t('admin.brands.inactive') },
  ];

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6'}>
      <AdminPageHeader
        embedded={embedded}
        crumbs={[{ label: t('admin.nav.groupPlatform') }, { label: t('admin.brands.title') }]}
        title={t('admin.brands.title')}
        sub={t('admin.brands.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
            {t('admin.brands.create')}
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
          <AdminKpiCard label={t('admin.brands.statTotal')} value={String(stats.total ?? brands.length)} />
          <AdminKpiCard label={t('admin.brands.statActive')} value={String(stats.active ?? brands.filter(b => b.isActive !== false).length)} tone="text-success" />
          <AdminKpiCard label={t('admin.brands.statDefault')} value={stats.default || brands.find(b => b.isDefault)?.name || '—'} tone="text-primary" />
          <AdminKpiCard label={t('admin.brands.statDomains')} value={String(stats.totalDomains ?? brands.reduce((s2, b) => s2 + (b.domains?.length || 0), 0))} />
        </section>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.brands.searchPlaceholder')}
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
        empty={brands.length === 0}
        emptyLabel={t('admin.brands.noBrands')}
        columns={[
          { key: 'name', label: t('admin.brands.columnName') },
          { key: 'slug', label: t('admin.brands.columnSlug') },
          { key: 'domains', label: t('admin.brands.columnDomains'), align: 'right' },
          { key: 'status', label: t('admin.brands.columnStatus') },
          { key: 'actions', label: t('admin.brands.columnActions'), align: 'right' },
        ]}
      >
        {brands.map(brand => {
          const initials = (brand.name || '?').slice(0, 2).toUpperCase();
          return (
            <AdminTableRow key={brand._id} className="cursor-pointer" onClick={() => openEdit(brand)}>
              <AdminTableCell>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                    {brand.logo
                      ? <img src={brand.logo} alt="" className="h-full w-full object-cover" />
                      : initials}
                  </span>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-bold text-text-1">{brand.name}</span>
                    {brand.isDefault && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-[3px] text-[10.5px] font-extrabold uppercase text-primary">
                        {t('admin.brands.default')}
                      </span>
                    )}
                  </div>
                </div>
              </AdminTableCell>
              <AdminTableCell><span className="font-mono text-xs text-text-3">{brand.slug}</span></AdminTableCell>
              <AdminTableCell align="right">
                <span className="font-mono text-xs font-semibold tabular-nums text-text-2">
                  {brand.domains?.length || 0} {t('admin.brands.domainsLabel')}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                  brand.isActive !== false ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                }`}>
                  {brand.isActive !== false ? t('admin.brands.active') : t('admin.brands.inactive')}
                </span>
              </AdminTableCell>
              <AdminTableActionsCell>
                <RowActions
                  label={t('admin.brands.columnActions')}
                  items={[
                    { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(brand) },
                    { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(brand._id) },
                  ]}
                />
              </AdminTableActionsCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.brands.countLine', { count: total.toLocaleString(locale), page, pages })}
      />

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-card border border-white/10 rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-text-1 mb-4">
              {modal === 'create' ? t('admin.brands.createTitle') : t('admin.brands.editTitle')}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.brands.fieldName')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.brands.fieldSlug')}</label>
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.brands.fieldDescription')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.brands.fieldLogo')}</label>
                <input value={form.logo} onChange={e => setForm(f => ({ ...f, logo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.brands.fieldFavicon')}</label>
                <input value={form.favicon} onChange={e => setForm(f => ({ ...f, favicon: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.brands.fieldThemeOverrides')}</label>
                <textarea value={form.themeOverrides} onChange={e => setForm(f => ({ ...f, themeOverrides: e.target.value }))} rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm font-mono focus:outline-none focus:border-primary" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                <label className="text-xs text-text-3">{t('admin.brands.fieldActive')}</label>
              </div>

              {modal !== 'create' && (
                <div className="border-t border-white/10 pt-3 mt-3">
                  <label className="block text-xs text-text-3 mb-2">{t('admin.brands.domains')}</label>
                  <div className="space-y-2">
                    {(form.domains || []).map(d => (
                      <div key={d} className="flex items-center gap-2">
                        <span className="text-text-1 text-sm flex-1 font-mono">{d}</span>
                        <button onClick={() => removeDomain(d)} className="text-red-300 text-xs hover:underline">{t('common.remove')}</button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="example.com"
                        className="flex-1 px-3 py-1.5 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-xs focus:outline-none focus:border-primary" />
                      <button onClick={addDomain} className="px-3 py-1.5 rounded-lg text-xs bg-primary text-white font-semibold hover:opacity-90 transition">
                        {t('admin.brands.addDomain')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
