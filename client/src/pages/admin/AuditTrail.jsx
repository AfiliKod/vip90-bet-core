import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs, ADMIN_BTN } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell } from '../../components/admin/AdminTable.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';

export default function AuditTrail() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const searchTimer = useRef(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 30 };
      if (filter) params.category = filter;
      if (actionFilter) params.action = actionFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const { data } = await api.get('/admin/audit/logs', { params });
      setLogs(Array.isArray(data) ? data : data?.logs || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [page, filter, actionFilter, dateFrom, dateTo, t]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/audit/stats');
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const onActionSearch = (v) => {
    setActionInput(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setActionFilter(v), 300);
  };

  const resetFilters = () => {
    clearTimeout(searchTimer.current);
    setActionInput('');
    setActionFilter('');
    setFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  async function exportLogs() {
    setExporting(true);
    setError('');
    try {
      const { data } = await api.get('/admin/audit/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError(t('common.error'));
    } finally {
      setExporting(false);
    }
  }

  function formatAction(action) {
    return action?.replace(/_/g, ' ') || '—';
  }

  function formatTarget(target) {
    if (!target) return '—';
    return `${target.type || ''}${target.id ? ` (${String(target.id).slice(0, 8)}...)` : ''}`;
  }

  const categories = [
    { key: '', label: t('admin.audit.filterAll') },
    { key: 'ADMIN_ACTION', label: t('admin.audit.filterAdmin') },
    { key: 'USER_ACTION', label: t('admin.audit.filterUser') },
    { key: 'SYSTEM', label: t('admin.audit.filterSystem') },
    { key: 'FINANCIAL', label: t('admin.audit.filterFinancial') },
    { key: 'SECURITY', label: t('admin.audit.filterSecurity') },
  ];

  const countLine = t('admin.audit.countLine', { count: total.toLocaleString(locale), page, pages: totalPages });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupCompliance') }, { label: t('admin.audit.title') }]}
        title={t('admin.audit.title')}
        sub={countLine}
        actions={(
          <button onClick={exportLogs} disabled={exporting} className={`${ADMIN_BTN} disabled:opacity-50`}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">download</span>
            {exporting ? t('common.exporting') : t('admin.audit.export')}
          </button>
        )}
      >
        <AdminTabs
          items={categories}
          value={filter}
          onChange={key => { setFilter(key); setPage(1); }}
        />
      </AdminPageHeader>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {stats && (
        <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: t('admin.audit.statTotal'), value: (stats.total ?? total) ?? 0 },
            { label: t('admin.audit.statToday'), value: stats.today },
            { label: t('admin.audit.statAdminActions'), value: stats.adminActions },
            { label: t('admin.audit.statFailed'), value: stats.failed, tone: 'text-danger' },
          ].map(k => (
            <article key={k.label} className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{k.label}</div>
              <div className={`mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight ${k.tone || 'text-text-1'}`}>
                {typeof k.value === 'number' ? k.value.toLocaleString(locale) : k.value == null ? '—' : String(k.value)}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={actionInput}
            onChange={e => onActionSearch(e.target.value)}
            placeholder={t('admin.audit.actionFilter')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] text-text-1 focus:border-white/25 focus:outline-none"
        />
        <span className="text-xs text-text-3">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] text-text-1 focus:border-white/25 focus:outline-none"
        />
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
        empty={logs.length === 0}
        emptyLabel={t('admin.audit.noLogs')}
        columns={[
          { key: 'time', label: t('admin.audit.columnTime') },
          { key: 'user', label: t('admin.audit.columnUser') },
          { key: 'action', label: t('admin.audit.columnAction') },
          { key: 'category', label: t('admin.audit.columnCategory') },
          { key: 'target', label: t('admin.audit.columnTarget') },
          { key: 'ip', label: t('admin.audit.columnIP') },
        ]}
      >
        {logs.map(log => {
          const name = log.user?.username || log.user?.email || log.userId || '—';
          const initials = String(name).slice(0, 2).toUpperCase();
          return (
            <AdminTableRow key={log._id}>
              <AdminTableCell>
                <span className="whitespace-nowrap font-mono text-xs text-text-3">
                  {log.createdAt ? fmt.formatDateTime(log.createdAt) : '—'}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-text-1">{name}</div>
                    {log.user?.email && log.user?.username && (
                      <div className="mt-0.5 truncate font-mono text-xs text-text-3">{log.user.email}</div>
                    )}
                  </div>
                </div>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs text-text-2">{formatAction(log.action)}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${
                  log.category === 'SECURITY' ? 'bg-danger/15 text-danger' :
                  log.category === 'FINANCIAL' ? 'bg-warning/15 text-warning' :
                  log.category === 'ADMIN_ACTION' ? 'bg-info/15 text-info' :
                  'bg-white/10 text-text-2'
                }`}>
                  {log.category || '—'}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs text-text-3">{formatTarget(log.target)}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs text-text-3">{log.ip || '—'}</span>
              </AdminTableCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>

      {totalPages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-card px-4 py-3 text-[13px] text-text-3">
          <span>{countLine}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
            >
              ‹
            </button>
            <span className="px-1 font-mono text-xs text-text-1">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
