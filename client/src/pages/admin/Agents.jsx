import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs, ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { useToastStore } from '../../store/toastStore';
import { formatMoney } from '../../utils/money.js';
import DetailDrawer from '../../components/admin/DetailDrawer.jsx';

export default function Agents() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const addToast = useToastStore(s => s.add);

  const [agents, setAgents] = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pages, setPages]   = useState(1);
  const [tab, setTab]       = useState('all'); // all|active|inactive → status param
  const [stats, setStats]   = useState({ all: 0, active: 0, inactive: 0, players: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const searchTimer = useRef(null);

  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ userId: '', commissionRate: '', notes: '' });
  const [creating, setCreating] = useState(false);

  const [assignModal, setAssignModal] = useState(null); // agent object or null
  const [assignPlayerId, setAssignPlayerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [transferModal, setTransferModal] = useState(null); // agent object or null
  const [transferForm, setTransferForm] = useState({ playerId: '', amount: '', note: '' });
  const [transferring, setTransferring] = useState(false);

  const [editModal, setEditModal] = useState(null); // agent object or null
  const [editForm, setEditForm] = useState({ commissionRate: '', notes: '' });
  const [editing, setEditing] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback((s, st, p) => {
    const params = new URLSearchParams({ page: p, limit: 20 });
    if (s) params.set('search', s);
    if (st !== 'all') params.set('status', st);
    setLoading(true);
    api.get(`/admin/agents?${params}`).then(r => {
      setAgents(r.data.agents || []);
      setTotal(r.data.total || 0);
      setPages(r.data.pages || 1);
      if (r.data.stats) setStats(r.data.stats);
      setErrored(false);
    }).catch(() => {
      setAgents([]);
      setErrored(true);
    }).finally(() => setLoading(false));
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

  const reload = () => load(search, tab, page);

  function openCreate() {
    setCreateForm({ userId: '', commissionRate: '', notes: '' });
    setCreateModal(true);
  }

  async function createAgent() {
    if (!createForm.userId.trim()) return;
    setCreating(true);
    try {
      const body = { userId: createForm.userId.trim() };
      if (createForm.commissionRate !== '') body.commissionRate = Number(createForm.commissionRate);
      if (createForm.notes.trim()) body.notes = createForm.notes.trim();
      await api.post('/admin/agents', body);
      addToast(t('admin.agents.created'), 'success');
      setCreateModal(false);
      reload();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.agents.createFailed'), 'error');
    } finally {
      setCreating(false);
    }
  }

  function openAssign(agent) {
    setAssignPlayerId('');
    setAssignModal(agent);
  }

  async function assignPlayer() {
    if (!assignPlayerId.trim()) return;
    setAssigning(true);
    try {
      await api.post(`/admin/agents/${assignModal._id}/players`, { playerId: assignPlayerId.trim() });
      addToast(t('admin.agents.playerAssigned'), 'success');
      setAssignModal(null);
      reload();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.agents.assignFailed'), 'error');
    } finally {
      setAssigning(false);
    }
  }

  function openEdit(agent) {
    setEditForm({ commissionRate: agent.commissionRate ?? '', notes: agent.notes ?? '' });
    setEditModal(agent);
  }

  async function saveEdit() {
    setEditing(true);
    try {
      const body = {};
      if (editForm.commissionRate !== '') body.commissionRate = Number(editForm.commissionRate);
      body.notes = editForm.notes;
      await api.patch(`/admin/agents/${editModal._id}`, body);
      addToast(t('admin.agents.updated'), 'success');
      setEditModal(null);
      reload();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.agents.updateFailed'), 'error');
    } finally {
      setEditing(false);
    }
  }

  // Agent modelinde gerçek bir "sil" uç noktası yok (bakiye/atanmış
  // oyuncu geçmişini kaybetmemek için kasıtlı) — isActive:false'a çevirmek
  // (deaktive etmek) mevcut PATCH ile zaten güvenli bir "kaldırma" karşılığı.
  async function toggleActive(agent) {
    setTogglingId(agent._id);
    try {
      await api.patch(`/admin/agents/${agent._id}`, { isActive: agent.isActive === false });
      reload();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.agents.updateFailed'), 'error');
    } finally {
      setTogglingId(null);
    }
  }

  function openTransfer(agent) {
    setTransferForm({ playerId: '', amount: '', note: '' });
    setTransferModal(agent);
  }

  async function transferFunds() {
    if (!transferForm.playerId.trim() || !transferForm.amount) return;
    setTransferring(true);
    try {
      const body = {
        playerId: transferForm.playerId.trim(),
        amount: Number(transferForm.amount),
      };
      if (transferForm.note.trim()) body.note = transferForm.note.trim();
      await api.post(`/admin/agents/${transferModal._id}/transfer`, body);
      addToast(t('admin.agents.transferred'), 'success');
      setTransferModal(null);
      reload();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.agents.transferFailed'), 'error');
    } finally {
      setTransferring(false);
    }
  }

  const tabItems = [
    { key: 'all', label: t('common.all'), count: stats.all },
    { key: 'active', label: t('admin.agents.active'), count: stats.active },
    { key: 'inactive', label: t('admin.agents.inactive'), count: stats.inactive },
  ];

  const kpis = [
    { label: t('admin.agents.title'), value: stats.all.toLocaleString(locale) },
    { label: t('admin.agents.active'), value: stats.active.toLocaleString(locale) },
    { label: t('admin.agents.inactive'), value: stats.inactive.toLocaleString(locale) },
    { label: t('admin.agents.columnPlayers'), value: stats.players.toLocaleString(locale) },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupCustomers') }, { label: t('admin.agents.title') }]}
        title={t('admin.agents.title')}
        sub={t('admin.agents.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <button type="button" onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
            {t('admin.agents.create')}
          </button>
        )}
      >
        <AdminTabs items={tabItems} value={tab} onChange={onTab} />
      </AdminPageHeader>

      {errored && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
          {t('common.error')}
        </div>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.agents.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] font-semibold text-text-1">
          {tab === 'all' ? t('admin.shell.filterAllStatuses') : t(`admin.agents.${tab}`)}
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
        empty={agents.length === 0}
        emptyLabel={t('admin.agents.noAgents')}
        columns={[
          { key: 'agent', label: t('admin.agents.columnAgent') },
          { key: 'commission', label: t('admin.agents.columnCommission') },
          { key: 'balance', label: t('admin.agents.columnBalance'), align: 'right' },
          { key: 'players', label: t('admin.agents.columnPlayers') },
          { key: 'status', label: t('admin.agents.columnStatus') },
          { key: 'actions', label: t('admin.agents.columnActions'), align: 'right' },
        ]}
      >
        {agents.map(agent => {
          const username = agent.userId?.username || agent.userId?.email || String(agent.userId || '');
          const initials = (username || '?').slice(0, 2).toUpperCase();
          const active = agent.isActive !== false;
          return (
            <AdminTableRow key={agent._id}>
              <AdminTableCell>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-text-1">{username}</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-text-3">{agent.userId?.email || '—'}</div>
                  </div>
                </div>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono font-semibold tabular-nums text-text-1">
                  {fmt.formatPercent(Number(agent.commissionRate || 0) / 100)}
                </span>
              </AdminTableCell>
              <AdminTableCell align="right">
                <span className="font-mono font-semibold tabular-nums text-primary">{formatMoney(agent.balance)}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs font-semibold tabular-nums text-text-2">
                  {(agent.players?.length ?? 0).toLocaleString(locale)}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                  active ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                }`}>
                  <i className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-danger'}`} />
                  {active ? t('admin.agents.active') : t('admin.agents.inactive')}
                </span>
              </AdminTableCell>
              <AdminTableActionsCell>
                <RowActions
                  label={t('admin.agents.columnActions')}
                  items={[
                    { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(agent) },
                    { key: 'assign', label: t('admin.agents.assignPlayer'), icon: 'person_add', onClick: () => openAssign(agent) },
                    { key: 'transfer', label: t('admin.agents.transfer'), icon: 'swap_horiz', onClick: () => openTransfer(agent) },
                    { key: 'toggle', label: active ? t('admin.agents.deactivate') : t('admin.agents.activate'), icon: active ? 'block' : 'check_circle', tone: active ? 'danger' : undefined, disabled: togglingId === agent._id, onClick: () => toggleActive(agent) },
                  ]}
                />
              </AdminTableActionsCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>

      {/* Sayfalama */}
      {pages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-card px-4 py-3 text-[13px] text-text-3">
          <span>
            {t('admin.agents.countLine', { count: total.toLocaleString(locale), page, pages })}
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

      {createModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-card border border-white/10 rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-text-1 mb-4">{t('admin.agents.createTitle')}</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldUserId')}</label>
                <input value={createForm.userId} onChange={e => setCreateForm(f => ({ ...f, userId: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldCommissionRate')}</label>
                <input type="number" min="0" max="50" step="0.1" value={createForm.commissionRate}
                  onChange={e => setCreateForm(f => ({ ...f, commissionRate: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldNotes')}</label>
                <textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setCreateModal(false)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={createAgent} disabled={creating || !createForm.userId.trim()}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                {creating ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <DetailDrawer
        open={!!assignModal || !!transferModal || !!editModal}
        onClose={() => { setAssignModal(null); setTransferModal(null); setEditModal(null); }}
        title={
          (assignModal || transferModal || editModal)?.userId?.username
          || (assignModal || transferModal || editModal)?.userId?.email
          || (assignModal || transferModal || editModal)?.userId
        }
        subtitle={assignModal ? t('admin.agents.assignTitle') : transferModal ? t('admin.agents.transferTitle') : editModal ? t('admin.agents.editTitle') : undefined}
      >
        {editModal && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldCommissionRate')}</label>
              <input type="number" min="0" max="50" step="0.1" value={editForm.commissionRate}
                onChange={e => setEditForm(f => ({ ...f, commissionRate: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldNotes')}</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={saveEdit} disabled={editing}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                {editing ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        )}
        {assignModal && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldPlayerId')}</label>
              <input value={assignPlayerId} onChange={e => setAssignPlayerId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssignModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={assignPlayer} disabled={assigning || !assignPlayerId.trim()}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                {assigning ? t('common.saving') : t('admin.agents.assignPlayer')}
              </button>
            </div>
          </div>
        )}
        {transferModal && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldPlayerId')}</label>
              <input value={transferForm.playerId} onChange={e => setTransferForm(f => ({ ...f, playerId: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldAmount')}</label>
              <input type="number" min="0" step="0.01" value={transferForm.amount}
                onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.agents.fieldNote')}</label>
              <input value={transferForm.note} onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTransferModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={transferFunds} disabled={transferring || !transferForm.playerId.trim() || !transferForm.amount}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                {transferring ? t('common.saving') : t('admin.agents.transfer')}
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
