import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import UserSlideOver from './components/UserSlideOver.jsx';
import CreateUserModal from './components/CreateUserModal.jsx';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell, AdminPager } from '../../components/admin/AdminTable.jsx';
import AdminPageHeader, { AdminTabs, ADMIN_BTN_GHOST, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { useMyPermissions } from '../../hooks/useMyPermissions.js';

const RISK_LABEL_KEYS = {
  low: 'admin.risk.levelLow',
  medium: 'admin.risk.levelMedium',
  high: 'admin.risk.levelHigh',
  critical: 'admin.risk.levelCritical',
};

const KYC_LABEL_KEYS = {
  not_started: 'kyc.status.notStarted',
  pending: 'kyc.status.pending',
  under_review: 'kyc.status.underReview',
  approved: 'kyc.status.approved',
  rejected: 'kyc.status.rejected',
  expired: 'kyc.status.expired',
};

function riskTone(tier) {
  if (tier === 'critical' || tier === 'high') return 'bg-danger/20 text-danger';
  if (tier === 'medium') return 'bg-warning/20 text-warning';
  return 'bg-success/15 text-success';
}

export default function AdminUsers() {
  const { t, locale } = useTranslation();
  const [users, setUsers]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState('all');
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const searchTimer = useRef(null);

  // O4 — Rol atama. Yetkisi olmayan admin'e düğmeler hiç gösterilmez.
  // Gerçek koruma sunucuda (requirePermission); buradaki kontrol görsel.
  const { can, loaded: permsLoaded } = useMyPermissions();
  const canSeeRoles = permsLoaded && can('admin:roles:read');
  const canManageRoles = permsLoaded && can('admin:roles:write');
  const [allRoles, setAllRoles] = useState([]);
  const [roleBusy, setRoleBusy] = useState('');
  const [pickerFor, setPickerFor] = useState(null);

  useEffect(() => {
    if (!canSeeRoles) return;
    api.get('/admin/roles')
      .then(({ data }) => setAllRoles(Array.isArray(data?.roles) ? data.roles : []))
      .catch(() => setAllRoles([]));
  }, [canSeeRoles]);

  async function assignRole(userId, roleId) {
    setRoleBusy(userId);
    try {
      await api.post(`/admin/users/${userId}/roles`, { roleId });
      load(search, status, page);          // listeyi tazele (roller populate edilir)
      setPickerFor(null);
    } catch { /* hata mesajı sunucunun gövdesinde; sessiz geç */ }
    setRoleBusy('');
  }

  async function removeRole(userId, roleId) {
    setRoleBusy(userId);
    try {
      await api.delete(`/admin/users/${userId}/roles/${roleId}`);
      load(search, status, page);
    } catch { /* aynı */ }
    setRoleBusy('');
  }

  // Sekme: all|active|suspended|deleted|vip — hepsi sunucu tarafı status filtresi.
  const [tab, setTab] = useState('all');
  const [facets, setFacets] = useState(null);
  const [kpiData, setKpiData] = useState(null);

  useEffect(() => {
    api.get('/admin/users/facets').then(r => setFacets(r.data)).catch(() => setFacets(null));
    api.get('/admin/users/kpis').then(r => setKpiData(r.data)).catch(() => setKpiData(null));
  }, []);

  const load = useCallback((s, st, p) => {
    const params = new URLSearchParams({ search: s, status: st, page: p, limit: 20 });
    api.get(`/admin/users?${params}`).then(r => {
      setUsers(r.data.users);
      setTotal(r.data.total);
      setPages(r.data.pages);
    }).catch(() => {});
  }, []);

  // search bilinçli olarak dışarıda — arama debounce'u onSearch içinde load'u çağırır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(search, status, page); }, [status, page, load]);

  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, status, 1), 300);
  };

  const onTab = (key) => {
    setTab(key);
    setPage(1);
    setStatus(key);
  };

  const handleUpdated = () => {
    load(search, status, page);
    if (selected) {
      api.get(`/admin/users?search=${encodeURIComponent(selected.username)}&limit=1`)
        .then(r => { if (r.data.users[0]) setSelected(r.data.users[0]); })
        .catch(() => {});
    }
  };

  const [searchParams] = useSearchParams();

  useEffect(() => {
    const username = searchParams.get('openUser');
    if (!username) return;
    // safeRegex sunucuda unanchored/düzensiz arama yapıyor (limit=1 + createdAt desc
    // ile "ahmet" → "ahmet1907" gibi yanlış kullanıcıyı açabilir). Exact === eşleşme
    // zorunlu; bulunamazsa panel AÇILMAZ (yanlış hesap açılmaktan daha güvenli).
    api.get(`/admin/users?search=${encodeURIComponent(username)}&limit=20`)
      .then(r => {
        const match = (r.data.users || []).find(u => u.username === username);
        if (match) setSelected(match);
      })
      .catch(() => {});
  }, [searchParams]);

  const visible = users;
  const cnt = (k) => (facets && Number.isFinite(facets[k]) ? facets[k] : undefined);

  const tabItems = [
    { key: 'all', label: t('common.all'), count: cnt('all') },
    { key: 'active', label: t('admin.users.active'), count: cnt('active') },
    { key: 'suspended', label: t('admin.users.suspended'), count: cnt('suspended') },
    { key: 'deleted', label: t('admin.users.deleted'), count: cnt('deleted') },
    { key: 'vip', label: t('admin.nav.vip'), count: cnt('vip') },
  ];

  const pct = (v) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v / 100);
  const num = (v) => (Number.isFinite(v) ? v.toLocaleString(locale) : '—');
  const delta = (v) => (Number.isFinite(v) ? t('admin.users.kpi.deltaWeekly', { value: pct(v) }) : null);
  const kd = kpiData || {};
  const kpis = [
    { label: t('admin.dashboard.kpi.totalUsers'), value: total.toLocaleString(locale), sub: Number.isFinite(kd.newToday) ? t('admin.users.kpi.newToday', { count: kd.newToday }) : null },
    { label: t('admin.users.kpi.active30d'), value: num(kd.active30d), sub: delta(kd.active30dDeltaPct) },
    { label: t('admin.users.kpi.kycPending'), value: num(kd.kycPending), sub: null },
    { label: t('admin.users.kpi.avgBalance'), value: Number.isFinite(kd.avgBalance) ? formatMoney(kd.avgBalance) : '—', sub: delta(kd.avgBalanceDeltaPct) },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupCustomers'), to: '/admin/users' }, { label: t('admin.nav.users') }]}
        title={t('admin.nav.users')}
        sub={t('admin.users.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <>
            <button type="button" className={`${ADMIN_BTN_GHOST} hidden sm:inline-flex`}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">file_download</span>
              {t('admin.dashboard.exportBtn')}
            </button>
            <button type="button" onClick={() => setShowCreate(true)} className={ADMIN_BTN_PRIMARY}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">person_add</span>
              {t('admin.users.newUser')}
            </button>
          </>
        )}
      >
        <AdminTabs items={tabItems} value={tab} onChange={onTab} />
      </AdminPageHeader>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] font-semibold text-text-1">
          {tab === 'all'
            ? t('admin.shell.filterAllStatuses')
            : tab === 'vip'
              ? t('admin.nav.vip')
              : t(`admin.users.${tab}`)}
          <span className="material-symbols-outlined !text-[16px] text-text-3" aria-hidden="true">expand_more</span>
        </div>
        <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-text-3 sm:inline-flex">
          {t('admin.shell.filterAllKycTiers')}
        </span>
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
        empty={visible.length === 0}
        emptyLabel={t('admin.users.noneFound')}
        columns={[
          { key: 'user', label: t('admin.users.userCol') },
          { key: 'email', label: t('admin.users.email') },
          { key: 'balance', label: t('admin.userSlideOver.balance'), align: 'right' },
          { key: 'status', label: t('admin.users.status') },
          { key: 'kyc', label: t('admin.users.colKyc') },
          { key: 'risk', label: t('admin.users.colRisk') },
          { key: 'registered', label: t('admin.users.colRegistered') },
          ...(canSeeRoles ? [{ key: 'roles', label: t('admin.users.colRoles') }] : []),
          { key: 'actions', label: t('admin.users.colActions') },
        ]}
      >
              {visible.map(u => {
                const kycKey = KYC_LABEL_KEYS[u.kycTier];
                const riskKey = RISK_LABEL_KEYS[u.riskTier];
                const initials = (u.username || '?').slice(0, 2).toUpperCase();
                return (
                  <AdminTableRow
                    key={u._id}
                    onClick={() => setSelected(u)}
                    className={`cursor-pointer ${selected?._id === u._id ? 'bg-primary/10' : ''} ${u.deletedAt ? 'opacity-50' : ''}`}
                  >
                    <AdminTableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-bold text-text-1">{u.username}</div>
                          <div className="mt-0.5 font-mono text-xs text-text-3">USR-{String(u._id || '').slice(-6).toUpperCase()}</div>
                        </div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell><span className="font-mono text-xs text-text-3">{u.email || '—'}</span></AdminTableCell>
                    <AdminTableCell align="right" className="font-mono font-semibold tabular-nums text-primary">{formatMoney(u.balance)}</AdminTableCell>
                    <AdminTableCell>
                      {u.deletedAt ? (
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-extrabold text-text-3">
                          {t('admin.users.deleted')}
                        </span>
                      ) : u.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-extrabold text-success">
                          <i className="h-1.5 w-1.5 rounded-full bg-success" />
                          {t('admin.users.active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-extrabold text-danger">
                          <i className="h-1.5 w-1.5 rounded-full bg-danger" />
                          {t('admin.users.suspended')}
                        </span>
                      )}
                    </AdminTableCell>
                    <AdminTableCell>
                      {kycKey ? (
                        <span className="rounded-full bg-info/15 px-2.5 py-1 text-[11px] font-extrabold text-info">
                          {t(kycKey)}
                        </span>
                      ) : <span className="text-text-3">—</span>}
                    </AdminTableCell>
                    <AdminTableCell>
                      {riskKey ? (
                        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${riskTone(u.riskTier)}`}>
                          {t(riskKey)}
                        </span>
                      ) : <span className="text-text-3">—</span>}
                    </AdminTableCell>
                    <AdminTableCell><span className="font-mono text-xs text-text-3">{u.createdAt ? new Date(u.createdAt).toLocaleDateString(locale) : '—'}</span></AdminTableCell>
                    {canSeeRoles && (
                      <AdminTableCell onClick={e => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1">
                          {(u.roles || []).map(r => (
                            <span key={r._id} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                              {r.displayName || r.name}
                              {canManageRoles && (
                                <button
                                  type="button"
                                  disabled={roleBusy === u._id}
                                  onClick={() => removeRole(u._id, r._id)}
                                  className="text-primary/60 transition hover:text-danger disabled:opacity-40"
                                  aria-label={t('admin.users.removeRole')}
                                >
                                  <span className="material-symbols-outlined !text-[12px]" aria-hidden="true">close</span>
                                </button>
                              )}
                            </span>
                          ))}
                          {canManageRoles && (
                            <button
                              type="button"
                              disabled={roleBusy === u._id}
                              onClick={() => setPickerFor(pickerFor === u._id ? null : u._id)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-white/25 text-text-3 transition hover:border-primary/50 hover:text-primary disabled:opacity-40"
                              aria-label={t('admin.users.assignRole')}
                            >
                              <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">add</span>
                            </button>
                          )}
                        </div>
                        {pickerFor === u._id && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {allRoles.filter(r => !(u.roles || []).some(x => x._id === r._id)).map(r => (
                              <button
                                key={r._id}
                                type="button"
                                disabled={roleBusy === u._id}
                                onClick={() => assignRole(u._id, r._id)}
                                className="rounded-md border border-white/10 bg-bg-hover px-1.5 py-0.5 text-[11px] font-semibold text-text-2 transition hover:border-primary/40 hover:text-primary disabled:opacity-40"
                              >
                                {r.displayName || r.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </AdminTableCell>
                    )}
                    <AdminTableActionsCell>
                      <button
                        type="button"
                        onClick={() => setSelected(u)}
                        title={t('admin.users.rowOpen')}
                        aria-label={t('admin.users.rowOpen')}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-text-3 transition hover:bg-bg-hover hover:text-text-1"
                      >
                        <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">open_in_new</span>
                      </button>
                    </AdminTableActionsCell>
                  </AdminTableRow>
                );
              })}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.users.pagerTotal', { count: total.toLocaleString(locale), limit: 20 })}
      />

      <UserSlideOver
        user={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load(search, status, 1)}
        />
      )}
    </div>
  );
}
