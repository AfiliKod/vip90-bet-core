import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs, ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminExpandRow, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

export default function Segments() {
  const { t, locale } = useTranslation();
  const [segments, setSegments] = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [tab, setTab]               = useState('all'); // all|active|inactive → isActive param
  const [counts, setCounts]         = useState({ all: 0, active: 0, inactive: 0, players: 0 });
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({ name: '', slug: '', description: '', criteria: '{}', isActive: true });
  const [saving, setSaving]         = useState(false);
  const [notice, setNotice]         = useState(null);
  const [expanded, setExpanded]     = useState(null);
  const [players, setPlayers]       = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const searchTimer = useRef(null);

  const load = useCallback((s, st, p) => {
    const params = new URLSearchParams({ page: p, limit: 20 });
    if (s) params.set('search', s);
    if (st !== 'all') params.set('isActive', st === 'active' ? 'true' : 'false');
    setLoading(true);
    api.get(`/admin/segments?${params}`).then(r => {
      setSegments(r.data.segments || []);
      setTotal(r.data.total || 0);
      setPages(r.data.pages || 1);
      if (r.data.counts) setCounts(r.data.counts);
    }).catch(() => setSegments([])).finally(() => setLoading(false));
  }, []);

  // search bilinçli olarak dışarıda — arama debounce'u onSearch içinde load'u çağırır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(search, tab, page); }, [tab, page, load]);

  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, tab, 1), 300);
  };

  const onTab = (key) => {
    clearTimeout(searchTimer.current);
    setTab(key);
    setPage(1);
  };

  function openCreate() {
    setForm({ name: '', slug: '', description: '', criteria: '{}', isActive: true });
    setModal('create');
  }

  function openEdit(seg) {
    setForm({
      name: seg.name || '',
      slug: seg.slug || '',
      description: seg.description || '',
      criteria: JSON.stringify(seg.criteria || {}, null, 2),
      isActive: seg.isActive !== false,
    });
    setModal(seg);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const body = {
        ...form,
        criteria: JSON.parse(form.criteria || '{}'),
      };
      if (modal === 'create') {
        await api.post('/admin/segments', body);
      } else {
        await api.patch(`/admin/segments/${modal._id}`, body);
      }
      setNotice({ type: 'ok', text: t('admin.segments.saved') });
      setModal(null);
      load(search, tab, page);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.segments.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm(t('admin.segments.confirmDelete'))) return;
    setNotice(null);
    try {
      await api.delete(`/admin/segments/${id}`);
      setNotice({ type: 'ok', text: t('admin.segments.deleted') });
      load(search, tab, page);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.segments.deleteFailed') });
    }
  }

  async function loadPlayers(segId) {
    if (expanded === segId) { setExpanded(null); return; }
    setExpanded(segId);
    setPlayersLoading(true);
    try {
      const { data } = await api.get(`/admin/segments/${segId}/players`);
      setPlayers(data.players || data || []);
    } catch {
      setPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  }

  async function compute(segId) {
    setNotice(null);
    try {
      await api.post(`/admin/segments/${segId}/compute`);
      setNotice({ type: 'ok', text: t('admin.segments.computed') });
      load(search, tab, page);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.segments.computeFailed') });
    }
  }

  const tabItems = [
    { key: 'all', label: t('common.all'), count: counts.all },
    { key: 'active', label: t('admin.segments.active'), count: counts.active },
    { key: 'inactive', label: t('admin.segments.inactive'), count: counts.inactive },
  ];

  const kpis = [
    { label: t('admin.segments.statSegments'), value: counts.all.toLocaleString(locale) },
    { label: t('admin.segments.statActive'), value: counts.active.toLocaleString(locale) },
    { label: t('admin.segments.inactive'), value: counts.inactive.toLocaleString(locale) },
    { label: t('admin.segments.statPlayers'), value: counts.players.toLocaleString(locale) },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupCustomers') }, { label: t('admin.segments.title') }]}
        title={t('admin.segments.title')}
        sub={t('admin.segments.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <button type="button" onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
            {t('admin.segments.create')}
          </button>
        )}
      >
        <AdminTabs items={tabItems} value={tab} onChange={onTab} />
      </AdminPageHeader>

      {notice && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          notice.type === 'ok' ? 'bg-success/10 border border-success/30 text-success' : 'bg-danger/10 border border-danger/30 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.segments.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] font-semibold text-text-1">
          {tab === 'all' ? t('admin.shell.filterAllStatuses') : t(`admin.segments.${tab}`)}
          <span className="material-symbols-outlined !text-[16px] text-text-3" aria-hidden="true">expand_more</span>
        </div>
        <button
          type="button"
          onClick={() => { onSearch(''); onTab('all'); }}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      {/* Mini KPI */}
      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map(k => (
          <article key={k.label} className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{k.label}</div>
            <div className="mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">{k.value}</div>
            {k.sub && <div className="mt-1.5 text-xs font-semibold text-text-3">{k.sub}</div>}
          </article>
        ))}
      </section>

      {/* Tablo */}
      <AdminTable
        loading={loading}
        empty={segments.length === 0}
        emptyLabel={t('admin.segments.noSegments')}
        columns={[
          { key: 'name', label: t('admin.segments.columnName') },
          { key: 'players', label: t('admin.segments.columnPlayers') },
          { key: 'status', label: t('admin.segments.columnStatus') },
          { key: 'actions', label: t('admin.segments.columnActions'), align: 'right' },
        ]}
      >
        {segments.map(seg => {
          const active = seg.isActive !== false;
          const initials = (seg.name || '?').slice(0, 2).toUpperCase();
          return (
            <Fragment key={seg._id}>
              <AdminTableRow className="cursor-pointer" onClick={() => loadPlayers(seg._id)}>
                <AdminTableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-text-1">{seg.name}</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-text-3">{seg.slug}</div>
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); loadPlayers(seg._id); }}
                    aria-expanded={expanded === seg._id}
                    className="inline-flex items-center gap-1 font-mono text-xs font-bold text-primary transition hover:underline"
                  >
                    {(seg.playerCount ?? 0).toLocaleString(locale)} {t('admin.segments.playersLabel')}
                    <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">
                      {expanded === seg._id ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                </AdminTableCell>
                <AdminTableCell>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                    active ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                  }`}>
                    <i className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-danger'}`} />
                    {active ? t('admin.segments.active') : t('admin.segments.inactive')}
                  </span>
                </AdminTableCell>
                <AdminTableActionsCell>
                  <RowActions
                    label={t('admin.segments.columnActions')}
                    items={[
                      { key: 'recompute', label: t('admin.segments.recompute'), icon: 'refresh', onClick: () => compute(seg._id) },
                      { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(seg) },
                      { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(seg._id) },
                    ]}
                  />
                </AdminTableActionsCell>
              </AdminTableRow>
              <AdminExpandRow colSpan={4} open={expanded === seg._id}>
                {playersLoading ? (
                  <div className="text-xs text-text-3">{t('common.loading')}</div>
                ) : players.length === 0 ? (
                  <div className="text-xs text-text-3">{t('admin.segments.noPlayers')}</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {players.map(p => (
                      <span key={p._id} className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/5 bg-bg-hover px-2.5 py-1.5 text-xs">
                        <span className="font-bold text-text-1">{p.username || p.email}</span>
                        <span className="font-mono text-text-3">{p.email}</span>
                      </span>
                    ))}
                  </div>
                )}
              </AdminExpandRow>
            </Fragment>
          );
        })}
      </AdminTable>

      {/* Sayfalama */}
      {pages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-card px-4 py-3 text-[13px] text-text-3">
          <span>
            {t('admin.segments.countLine', { count: total.toLocaleString(locale), page, pages })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
            >
              ‹
            </button>
            <span className="px-1 font-mono text-xs text-text-1">{page} / {pages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-card border border-white/10 rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-text-1 mb-4">
              {modal === 'create' ? t('admin.segments.createTitle') : t('admin.segments.editTitle')}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.segments.fieldName')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.segments.fieldSlug')}</label>
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.segments.fieldDescription')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs text-text-3 mb-1">{t('admin.segments.fieldCriteria')}</label>
                <textarea value={form.criteria} onChange={e => setForm(f => ({ ...f, criteria: e.target.value }))} rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-bg-hover border border-white/10 text-text-1 text-sm font-mono focus:outline-none focus:border-primary" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="rounded" />
                <label className="text-xs text-text-3">{t('admin.segments.fieldActive')}</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
              <button onClick={() => setModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button onClick={save} disabled={saving} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
