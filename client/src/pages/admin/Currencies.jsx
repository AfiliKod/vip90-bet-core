import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

export default function Currencies({ embedded = false }) {
  const { t, locale } = useTranslation();
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', symbol: '', rate: '1', isActive: true, isDefault: false });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const searchTimer = useRef(null);

  // Backend /admin/currencies sayfalama + arama destekliyor.
  const loadCurrencies = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.isActive = status === 'active' ? 'true' : 'false';
      const [curRes, statsRes] = await Promise.all([
        api.get('/admin/currencies', { params }),
        api.get('/admin/currencies/stats').catch(() => ({ data: null })),
      ]);
      setCurrencies(curRes.data.currencies || curRes.data || []);
      setTotal(curRes.data.total ?? 0);
      setPages(curRes.data.pages || 1);
      setStats(statsRes.data);
    } catch {
      setCurrencies([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { loadCurrencies(); }, [loadCurrencies]);

  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const onTab = (key) => { setStatus(key); setPage(1); };

  function openCreate() {
    setForm({ code: '', name: '', symbol: '', rate: '1', isActive: true, isDefault: false });
    setModal('create');
  }

  function openEdit(cur) {
    setForm({
      code: cur.code || '',
      name: cur.name || '',
      symbol: cur.symbol || '',
      rate: String(cur.rate || 1),
      isActive: cur.isActive !== false,
      isDefault: cur.isDefault || false,
    });
    setModal(cur);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const body = { ...form, rate: Number(form.rate) };
      if (modal === 'create') {
        await api.post('/admin/currencies', body);
      } else {
        await api.patch(`/admin/currencies/${modal._id}`, body);
      }
      setNotice({ type: 'ok', text: t('admin.currencies.saved') });
      setModal(null);
      loadCurrencies();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.currencies.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm(t('admin.currencies.confirmDelete'))) return;
    setNotice(null);
    try {
      await api.delete(`/admin/currencies/${id}`);
      setNotice({ type: 'ok', text: t('admin.currencies.deleted') });
      loadCurrencies();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.currencies.deleteFailed') });
    }
  }

  async function updateRate(id, rate) {
    setNotice(null);
    try {
      await api.patch(`/admin/currencies/${id}/rate`, { rate: Number(rate) });
      setNotice({ type: 'ok', text: t('admin.currencies.rateUpdated') });
      loadCurrencies();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.currencies.rateUpdateFailed') });
    }
  }

  const tabItems = [
    { key: 'all', label: t('common.all') },
    { key: 'active', label: t('admin.currencies.active') },
    { key: 'inactive', label: t('admin.currencies.inactive') },
  ];

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6'}>
      <AdminPageHeader
        embedded={embedded}
        crumbs={[{ label: t('admin.nav.groupFinance') }, { label: t('admin.currencies.title') }]}
        title={t('admin.currencies.title')}
        sub={t('admin.currencies.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
            {t('admin.currencies.create')}
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
          <AdminKpiCard label={t('admin.currencies.statTotal')} value={String(stats.total ?? currencies.length)} />
          <AdminKpiCard label={t('admin.currencies.statActive')} value={String(stats.active ?? currencies.filter(c => c.isActive !== false).length)} tone="text-success" />
          <AdminKpiCard label={t('admin.currencies.statDefault')} value={stats.default || currencies.find(c => c.isDefault)?.code || '—'} tone="text-primary" />
          <AdminKpiCard label={t('admin.currencies.statRates')} value={stats.ratesUpdated ? new Date(stats.ratesUpdated).toLocaleDateString(locale) : '—'} />
        </section>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.currencies.searchPlaceholder')}
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
        empty={currencies.length === 0}
        emptyLabel={t('admin.currencies.noCurrencies')}
        columns={[
          { key: 'code', label: t('admin.currencies.columnCode') },
          { key: 'name', label: t('admin.currencies.columnName') },
          { key: 'symbol', label: t('admin.currencies.columnSymbol') },
          { key: 'rate', label: t('admin.currencies.columnRate') },
          { key: 'status', label: t('admin.currencies.columnStatus') },
          { key: 'actions', label: t('admin.currencies.columnActions'), align: 'right' },
        ]}
      >
        {currencies.map(cur => (
          <AdminTableRow key={cur._id} className="cursor-pointer" onClick={() => openEdit(cur)}>
            <AdminTableCell>
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                  {String(cur.symbol || cur.code || '?').slice(0, 2).toUpperCase()}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-bold text-text-1">{cur.code}</span>
                  {cur.isDefault && (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-[3px] text-[10.5px] font-extrabold uppercase text-primary">
                      {t('admin.currencies.default')}
                    </span>
                  )}
                </div>
              </div>
            </AdminTableCell>
            <AdminTableCell><span className="text-text-2">{cur.name}</span></AdminTableCell>
            <AdminTableCell>
              <span className="font-mono text-sm font-bold text-text-1">{cur.symbol}</span>
            </AdminTableCell>
            <AdminTableCell>
              <input
                type="number"
                defaultValue={cur.rate || 1}
                onClick={e => e.stopPropagation()}
                onBlur={e => updateRate(cur._id, e.target.value)}
                className="h-8 w-24 rounded-lg border border-white/10 bg-bg-deep px-2 font-mono text-xs tabular-nums text-text-1 focus:border-white/25 focus:outline-none"
              />
            </AdminTableCell>
            <AdminTableCell>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                cur.isActive !== false ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
              }`}>
                {cur.isActive !== false ? t('admin.currencies.active') : t('admin.currencies.inactive')}
              </span>
            </AdminTableCell>
            <AdminTableActionsCell>
              <RowActions
                label={t('admin.currencies.columnActions')}
                items={[
                  { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(cur) },
                  { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(cur._id) },
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
        totalLabel={t('admin.currencies.countLine', { count: total.toLocaleString(locale), page, pages })}
      />

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-card border border-white/10 rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-text-1 mb-4">
              {modal === 'create' ? t('admin.currencies.createTitle') : t('admin.currencies.editTitle')}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.currencies.fieldCode')}</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary"
                  maxLength={3} placeholder="USD" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.currencies.fieldName')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary"
                  placeholder="US Dollar" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.currencies.fieldSymbol')}</label>
                <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary"
                  placeholder="$" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.currencies.fieldRate')}</label>
                <input type="number" step="0.0001" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-text-3">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                  {t('admin.currencies.fieldActive')}
                </label>
                <label className="flex items-center gap-2 text-xs text-text-3">
                  <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                  {t('admin.currencies.fieldDefault')}
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
