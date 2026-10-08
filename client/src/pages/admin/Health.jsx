import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { useToastStore } from '../../store/toastStore';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard } from '../../components/admin/AdminTable.jsx';

export default function Health() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const addToast = useToastStore(s => s.add);
  const [health, setHealth] = useState(null);
  const [services, setServices] = useState([]);
  const [system, setSystem] = useState(null);
  const [database, setDatabase] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [errors, setErrors] = useState([]);
  const [errPage, setErrPage] = useState(1);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorsPages, setErrorsPages] = useState(1);
  const [errorStatus, setErrorStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loadError, setLoadError] = useState(false);

  // IA birleştirmesi: her alt istek KENDİ .catch()'ine sahip — Igames.jsx'te
  // /admin/health'in .catch()'i eksik olduğu için TEK bir alt istek
  // başarısız olsa bile Promise.all'ın TAMAMI reddediliyor, health/system/
  // metrics/errors hiçbiri set edilmiyordu (A9 kök nedeni). Artık her istek
  // bağımsız başarısız olabilir, sayfa kısmi veriyle de anlamlı kalır.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [healthRes, servicesRes, systemRes, metricsRes, errorsRes, errStatusRes] = await Promise.all([
        api.get('/admin/health').catch(() => ({ data: null })),
        api.get('/admin/health/services').catch(() => ({ data: [] })),
        api.get('/admin/health/system').catch(() => ({ data: null })),
        api.get('/admin/health/metrics').catch(() => ({ data: null })),
        api.get(`/admin/errors/recent?page=${errPage}&limit=20`).catch(() => ({ data: { entries: [], total: 0, pages: 1 } })),
        api.get('/admin/errors/status').catch(() => ({ data: null })),
      ]);
       setHealth(healthRes.data);
       const serviceData = servicesRes.data?.services || servicesRes.data;
       setServices(Array.isArray(serviceData) ? serviceData : []);
      // /health/system {system, database} sarmalayıcıyı aç
      setSystem(systemRes.data?.system || null);
      setDatabase(systemRes.data?.database || null);
      setMetrics(metricsRes.data?.metrics || metricsRes.data);
       const entryList = Array.isArray(errorsRes.data?.entries) ? errorsRes.data.entries : [];
      setErrors(entryList);
      setErrorsTotal(errorsRes.data?.total ?? entryList.length);
      setErrorsPages(errorsRes.data?.pages ?? 1);
      setErrorStatus(errStatusRes.data);
      const serviceCount = Array.isArray(servicesRes.data)
        ? servicesRes.data.length
        : servicesRes.data?.services?.length || 0;
      setLoadError(!healthRes.data && !systemRes.data && !metricsRes.data && !errStatusRes.data && serviceCount === 0 && !errorsRes.data?.entries?.length);
    } finally {
      setLoading(false);
    }
  }, [errPage]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function clearErrors() {
    if (!confirm(t('admin.igames.confirmClearErrors'))) return;
    try {
      await api.post('/admin/errors/clear');
      setErrors([]);
      addToast(t('admin.igames.errorLogCleared'), 'success');
    } catch {
      addToast(t('admin.igames.clearFailed'), 'error');
    }
  }

  async function forceCheck() {
    setChecking(true);
    setNotice(null);
    try {
      await api.post('/admin/health/check');
      setNotice({ type: 'ok', text: t('admin.health.checkComplete') });
      loadAll();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.health.checkFailed') });
    } finally {
      setChecking(false);
    }
  }

  function statusColor(status) {
    if (status === 'healthy' || status === 'ok' || status === 'up') return 'text-success';
    if (status === 'degraded' || status === 'warn') return 'text-warning';
    return 'text-danger';
  }

  function statusBg(status) {
    if (status === 'healthy' || status === 'ok' || status === 'up') return 'bg-success/15';
    if (status === 'degraded' || status === 'warn') return 'bg-warning/15';
    return 'bg-danger/15';
  }


  function formatBytes(bytes) {
    if (bytes == null) return '—';
    if (bytes >= 1073741824) return `${fmt.formatNumber((bytes / 1073741824).toFixed(1))} GB`;
    if (bytes >= 1048576) return `${fmt.formatNumber((bytes / 1048576).toFixed(1))} MB`;
    return `${fmt.formatNumber((bytes / 1024).toFixed(1))} KB`;
  }

  // Birim kısaltmaları i18n'den gelir (tr: g/sa/dk, en: d/h/m …).
  function formatUptime(seconds) {
    if (seconds == null) return '—';
    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const u = (k) => t(`admin.health.uptimeUnit.${k}`);
    if (days > 0) return `${fmt.formatNumber(days)}${u('day')} ${fmt.formatNumber(hrs)}${u('hour')}`;
    if (hrs > 0) return `${fmt.formatNumber(hrs)}${u('hour')} ${fmt.formatNumber(mins)}${u('minute')}`;
    return `${fmt.formatNumber(mins)}${u('minute')}`;
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-bg-card" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupPlatform') }, { label: t('admin.health.title') }]}
        title={t('admin.health.title')}
        actions={(
          <button onClick={forceCheck} disabled={checking} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">health_and_safety</span>
            {checking ? t('admin.health.checking') : t('admin.health.forceCheck')}
          </button>
        )}
      />

      {loadError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
          {t('common.error')}
        </div>
      )}

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok' ? 'border-success/30 bg-success/15 text-success' : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {health && (
        <section className="mb-6 rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className={`grid h-7 w-7 place-items-center rounded-lg ${statusBg(health.status)}`}>
              <span className={`material-symbols-outlined !text-[16px] ${statusColor(health.status)}`} aria-hidden="true">
                {health.status === 'healthy' || health.status === 'ok' || health.status === 'up' ? 'check_circle' : 'warning'}
              </span>
            </span>
            <span className={`font-mono text-sm font-extrabold uppercase tracking-wide ${statusColor(health.status)}`}>
              {health.status?.toUpperCase() || '—'}
            </span>
            {health.system?.uptime != null && (
              <span className="ml-auto font-mono text-xs font-bold tabular-nums text-text-3">
                {t('admin.health.uptime')}: {formatUptime(health.system.uptime)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.version')}</div>
              <div className="mt-1 truncate font-mono text-sm font-bold text-text-1">{health.version || '—'}</div>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.env')}</div>
              <div className="mt-1 truncate font-mono text-sm font-bold text-text-1">{health.env || '—'}</div>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.nodeVersion')}</div>
              <div className="mt-1 truncate font-mono text-sm font-bold text-text-1">{health.nodeVersion || '—'}</div>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.lastCheck')}</div>
              <div className="mt-1 truncate font-mono text-sm font-bold text-text-1">
                {health.lastCheck ? fmt.formatDateTime(health.lastCheck) : '—'}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">dns</span>
        </span>
        <h3 className="text-sm font-extrabold text-text-1">{t('admin.health.servicesTitle')}</h3>
        <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
          {services.length.toLocaleString(locale)}
        </span>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {services.length === 0 ? (
          <div className="col-span-full rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
            <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">cloud_off</span>
            <div className="mt-2 text-sm text-text-3">{t('admin.health.noServices')}</div>
          </div>
        ) : services.map(svc => (
          <div key={svc.name} className="rounded-xl border border-white/10 bg-bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold text-text-1">{svc.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${statusBg(svc.status)} ${statusColor(svc.status)}`}>
                {svc.status?.toUpperCase() || '—'}
              </span>
            </div>
            {svc.message && <div className="text-xs text-text-3">{svc.message}</div>}
            {svc.latency != null && <div className="text-xs text-text-3 mt-1">{t('admin.health.latency')}: {fmt.formatNumber(svc.latency)}ms</div>}
          </div>
        ))}
      </div>

      {system && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">memory</span>
            </span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.health.systemTitle')}</h3>
          </div>
          <section className="mb-6 rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.cpu')}</div>
                <div className="mt-1 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">
                  {system.cpu?.loadAvg?.[0] != null && system.cpu?.cores
                    ? fmt.formatPercent(Math.min(1, (system.cpu.loadAvg[0] / system.cpu.cores)))
                    : '—'}
                </div>
                {system.cpu?.cores && <div className="mt-0.5 text-[10px] text-text-3">{fmt.formatNumber(system.cpu.cores)} {t('admin.health.cores')}</div>}
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.memory')}</div>
                <div className="mt-1 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">{system.memory?.usagePercent != null ? fmt.formatPercent(Number(system.memory.usagePercent) / 100) : '—'}</div>
                {system.memory?.used != null && <div className="mt-0.5 text-[10px] text-text-3">{formatBytes(system.memory.used)} / {formatBytes(system.memory.total)}</div>}
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.disk')}</div>
                <div className="mt-1 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">{system.diskUsed != null && system.diskTotal ? fmt.formatPercent(system.diskUsed / system.diskTotal) : '—'}</div>
                {system.diskUsed != null && system.diskTotal != null && <div className="mt-0.5 text-[10px] text-text-3">{formatBytes(system.diskUsed)} / {formatBytes(system.diskTotal)}</div>}
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.health.uptime')}</div>
                <div className="mt-1 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">{formatUptime(system.uptime)}</div>
              </div>
            </div>
            {database?.status && (
              <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs">
                <span className="text-text-3">{t('admin.health.database')}:</span>
                <span className={`font-semibold ${statusColor(database.status)}`}>{database.status}</span>
                {database.duration != null && <span className="font-mono tabular-nums text-text-3">({fmt.formatNumber(database.duration)}ms)</span>}
              </div>
            )}
          </section>
        </>
      )}

      {metrics && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">monitoring</span>
            </span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.health.metricsTitle')}</h3>
          </div>
          {/* NOT: burası önce requestsToday/errorsToday/avgResponseTime/activeUsers
              bekliyordu — ama /admin/health/metrics bu alanların HİÇBİRİNİ
              döndürmüyor (uptime/memoryUsage/cpuUsage/activeHandles döndürüyor),
              yani şerit sürekli boş kalıyordu. Endpoint'in gerçekten verdiği
              operasyonel metrikler gösteriliyor. */}
          <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.uptime != null && (
              <AdminKpiCard label={t('admin.health.uptime')} value={formatUptime(metrics.uptime)} />
            )}
            {metrics.memoryUsage?.heapUsed != null && (
              <AdminKpiCard
                label={t('admin.health.memory')}
                value={formatBytes(metrics.memoryUsage.heapUsed)}
                tone="text-primary"
              />
            )}
            {metrics.cpuUsage?.user != null && (
              <AdminKpiCard
                label={t('admin.health.cpu')}
                value={`${fmt.formatNumber(Math.round((metrics.cpuUsage.user + metrics.cpuUsage.system) / 1000))}ms`}
              />
            )}
            {metrics.activeHandles != null && (
              <AdminKpiCard label={t('admin.health.activeHandles')} value={metrics.activeHandles.toLocaleString(locale)} />
            )}
          </section>
        </>
      )}

      {/* IA birleştirmesi: bu bölüm eskiden Igames.jsx'teydi, sistem geneli
          bir konu olduğu için buraya taşındı (bkz. denetim raporu). */}
      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-text-1">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-danger/15 text-danger">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">error</span>
            </span>
            {t('admin.igames.errorLogTitle')}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {errorStatus && (
              <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
                {t('admin.igames.errorLogSize', { size: fmt.formatNumber(errorStatus.sizeMB), count: fmt.formatNumber(errorsTotal) })}
              </span>
            )}
            <button
              onClick={loadAll}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2.5 text-xs font-bold text-text-2 transition hover:text-text-1 disabled:opacity-40"
            >
              <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">refresh</span>
              {t('common.refresh')}
            </button>
            <button
              onClick={clearErrors}
              disabled={errors.length === 0}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20 disabled:opacity-40"
            >
              <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">delete</span>
              {t('admin.igames.clear')}
            </button>
          </div>
        </div>
        <AdminTable
          empty={errors.length === 0}
          emptyLabel={t('admin.igames.noRecentErrors')}
          columns={[
            { key: 'level', label: t('admin.health.columnLevel') },
            { key: 'category', label: t('admin.health.columnCategory') },
            { key: 'message', label: t('admin.health.columnMessage') },
            { key: 'time', label: t('admin.health.columnTime') },
          ]}
        >
          {errors.map((e, i) => (
            <AdminTableRow key={`${e.timestamp || 'log'}-${i}`}>
              <AdminTableCell>
                <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${
                  e.level === 'CRITICAL' ? 'bg-danger/20 text-danger'
                    : e.level === 'ERROR' ? 'bg-warning/20 text-warning'
                      : 'bg-info/15 text-info'
                }`}>
                  {e.level}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs font-bold text-text-1">{e.category}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs text-text-1">{e.message}</span>
                {e.meta && (
                  <pre className="mt-1 overflow-x-auto text-[10px] text-text-3" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(e.meta, null, 0)}
                  </pre>
                )}
              </AdminTableCell>
              <AdminTableCell>
                <span className="whitespace-nowrap font-mono text-xs text-text-3">
                  {e.timestamp ? fmt.formatDateTime(e.timestamp) : '—'}
                </span>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTable>
        <AdminPager
          page={errPage}
          pages={errorsPages}
          onPage={setErrPage}
          totalLabel={t('admin.health.errorsCountLine', {
            count: fmt.formatNumber(errorsTotal),
            page: errPage,
            pages: errorsPages,
          })}
        />
      </div>
    </div>
  );
}
