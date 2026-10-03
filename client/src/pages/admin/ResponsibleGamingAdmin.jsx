import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';

const BADGE_CLS = 'inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase';

export default function ResponsibleGamingAdmin() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [notice, setNotice] = useState(null);
  const searchTimer = useRef(null);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter !== 'all') params.type = filter;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/admin/responsible-gaming/players', { params });
      setPlayers(data.players || []);
      setTotalPages(data.totalPages || data.pages || 1);
      setTotal(data.total ?? 0);
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  // 300 ms debounce — her tuşta istek atmak yerine yazma durduğunda bir kez.
  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const resetFilters = () => {
    clearTimeout(searchTimer.current);
    setSearch('');
    setFilter('all');
    setPage(1);
  };

  async function restrictPlayer(userId, reason) {
    setActionLoading(userId);
    setNotice(null);
    try {
      await api.post(`/admin/responsible-gaming/restrict/${userId}`, { reason: reason || 'Admin restriction' });
      setNotice({ type: 'ok', text: t('admin.responsibleGaming.playerRestricted') });
      loadPlayers();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.responsibleGaming.restrictFailed') });
    } finally {
      setActionLoading(null);
    }
  }

  async function liftRestriction(userId) {
    setActionLoading(userId);
    setNotice(null);
    try {
      await api.delete(`/admin/responsible-gaming/restrict/${userId}`);
      setNotice({ type: 'ok', text: t('admin.responsibleGaming.restrictionLifted') });
      loadPlayers();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.responsibleGaming.liftFailed') });
    } finally {
      setActionLoading(null);
    }
  }

  const filters = [
    { key: 'all', label: t('admin.responsibleGaming.filterAll') },
    { key: 'self_exclusion', label: t('admin.responsibleGaming.filterSelfExclusion') },
    { key: 'loss_limit', label: t('admin.responsibleGaming.filterLossLimit') },
    { key: 'wager_limit', label: t('admin.responsibleGaming.filterWagerLimit') },
    { key: 'cool_off', label: t('admin.responsibleGaming.filterCoolOff') },
    { key: 'restricted', label: t('admin.responsibleGaming.filterRestricted') },
  ];

  return (
    // Dış sarmalayıcı yok: Compliance.jsx wrapper'ı tab içeriğini sarar
    <div>
      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
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
            placeholder={t('admin.responsibleGaming.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition ${
              filter === f.key
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-white/10 bg-bg-hover text-text-2 hover:text-text-1'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      <AdminTable
        loading={loading}
        empty={players.length === 0}
        emptyLabel={t('admin.responsibleGaming.noPlayers')}
        columns={[
          { key: 'user', label: t('admin.responsibleGaming.columnUser') },
          { key: 'type', label: t('admin.responsibleGaming.columnType') },
          { key: 'details', label: t('admin.responsibleGaming.columnDetails') },
          { key: 'since', label: t('admin.responsibleGaming.columnSince') },
          { key: 'actions', label: t('admin.responsibleGaming.columnActions'), align: 'right' },
        ]}
      >
        {players.map(p => {
                // Server düz responsibleLimits şeması döndürür — nested restrictions yok
                const rl = p.responsibleLimits || {};
                const now = Date.now();
                const selfExclusionActive = rl.selfExclusionUntil && new Date(rl.selfExclusionUntil).getTime() > now;
                const coolOffActive = rl.coolOffUntil && new Date(rl.coolOffUntil).getTime() > now;
                const lossActive = rl.lossDaily != null && rl.lossDaily > 0;
                const wagerActive = rl.wagerDaily != null && rl.wagerDaily > 0;
                const details =
                  selfExclusionActive ? t('admin.responsibleGaming.untilLabel', { date: fmt.formatDateTime(rl.selfExclusionUntil) }) :
                  coolOffActive ? t('admin.responsibleGaming.untilLabel', { date: fmt.formatDateTime(rl.coolOffUntil) }) :
                  lossActive ? t('admin.responsibleGaming.limitLabel', { limit: formatMoney(rl.lossDaily) }) :
                  wagerActive ? t('admin.responsibleGaming.limitLabel', { limit: formatMoney(rl.wagerDaily) }) :
                  p.accountRestricted && p.restrictionReason ? p.restrictionReason : '—';
                const since = p.restrictedAt ? fmt.formatDateTime(p.restrictedAt) : '—';
                return (
                <AdminTableRow key={p._id}>
                  <AdminTableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                        {(p.username || p.email || '?').slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-text-1">{p.username || p.email}</div>
                        <div className="mt-0.5 truncate font-mono text-xs text-text-3">{p.email}</div>
                      </div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className={`${BADGE_CLS} bg-info/15 text-info`}>
                      {selfExclusionActive ? t('admin.responsibleGaming.typeSelfExclusion') :
                       coolOffActive ? t('admin.responsibleGaming.typeCoolOff') :
                       lossActive ? t('admin.responsibleGaming.typeLossLimit') :
                       wagerActive ? t('admin.responsibleGaming.typeWagerLimit') :
                       p.accountRestricted ? t('admin.responsibleGaming.typeRestricted') : '—'}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell><span className="text-xs text-text-2">{details}</span></AdminTableCell>
                  <AdminTableCell>
                    <span className="whitespace-nowrap font-mono text-xs text-text-3">{since}</span>
                  </AdminTableCell>
                  <AdminTableActionsCell>
                    {p.accountRestricted ? (
                      <button
                        type="button"
                        onClick={() => liftRestriction(p._id)}
                        disabled={actionLoading === p._id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-success/30 bg-success/15 px-2.5 text-xs font-bold text-success transition hover:bg-success/25 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">lock_open</span>
                        {actionLoading === p._id ? '...' : t('admin.responsibleGaming.liftRestriction')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => restrictPlayer(p._id)}
                        disabled={actionLoading === p._id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">lock</span>
                        {actionLoading === p._id ? '...' : t('admin.responsibleGaming.restrict')}
                      </button>
                    )}
                  </AdminTableActionsCell>
                </AdminTableRow>
                );
              })}
      </AdminTable>

      <AdminPager
        page={page}
        pages={totalPages}
        onPage={setPage}
        totalLabel={t('admin.responsibleGaming.countLine', {
          count: total.toLocaleString(locale),
          page,
          pages: totalPages,
        })}
      />
    </div>
  );
}
