import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN_PRIMARY, AdminTabs } from '../../components/admin/AdminPageHeader.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { formatMoney, getActiveCurrency } from '../../utils/money.js';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = ['#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const PIE_COLORS = ['#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

const MONEY_DATA_KEYS = new Set([
  'bet', 'ggr', 'total', 'totalBet', 'totalPayout', 'totalStake', 'avgStake',
  'deposit', 'withdraw', 'crypto_deposit', 'crypto_withdraw', 'pendingWithdrawTotal',
]);

function formatCurrency(value) {
  return formatMoney(value);
}

function formatNumber(value, locale) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString(locale, {
    notation: Math.abs(number) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  });
}

function useApiData(url) {
  const [state, setState] = useState({ data: null, error: false, loading: true });

  useEffect(() => {
    let mounted = true;
    api.get(url)
      .then(response => {
        if (mounted) setState({ data: response.data, error: false, loading: false });
      })
      .catch(() => {
        if (mounted) setState({ data: null, error: true, loading: false });
      });
    return () => { mounted = false; };
  }, [url]);

  return state;
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
      <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
      <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
      {t('common.error')}
    </div>
  );
}

function MetricCard({ title, value, subtitle, color }) {
  return (
    <article className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{title}</div>
      <div className={`mt-2 truncate font-mono text-[22px] font-bold tabular-nums tracking-tight ${color || 'text-text-1'}`}>{value}</div>
      {subtitle && <div className="mt-1 truncate text-xs text-text-3">{subtitle}</div>}
    </article>
  );
}

function PanelTitle({ children, icon = 'show_chart' }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{icon}</span>
      </span>
      <h3 className="min-w-0 truncate text-sm font-extrabold text-text-1">{children}</h3>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  const { locale } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/20 bg-bg-card px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-text-3">{label}</div>
      {payload.map((p, i) => {
        const value = typeof p.value === 'number'
          ? MONEY_DATA_KEYS.has(p.dataKey) ? formatCurrency(p.value) : formatNumber(p.value, locale)
          : p.value;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-text-2">{p.name}: <strong className="text-text-1">{value}</strong></span>
          </div>
        );
      })}
    </div>
  );
}

function OverviewTab() {
  const { t, locale } = useTranslation();
  const { data, error, loading } = useApiData('/admin/analytics/overview');
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  const users = data.users || {};
  const bets = data.bets || {};
  const casino = data.casino || {};
  const sports = data.sports || {};
  const finance = data.finance || {};
  const pending = data.pending || {};

  return (
    <div className="space-y-6">
      <PanelTitle icon="monitoring">{t('admin.analytics.tabOverview')}</PanelTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard title={t('admin.analytics.totalUsers')} value={formatNumber(users.total, locale)} subtitle={t('admin.analytics.newToday', { count: Number(users.newToday || 0).toLocaleString(locale) })} color="text-primary" />
        <MetricCard title={t('admin.analytics.totalBets')} value={formatNumber(bets.total, locale)} subtitle={t('admin.analytics.pendingCount', { count: Number(bets.pending || 0).toLocaleString(locale) })} color="text-primary" />
        <MetricCard title={t('admin.analytics.casinoRounds')} value={formatNumber(casino.totalRounds, locale)} subtitle={`GGR ${formatCurrency(casino.ggr)}`} color="text-warning" />
        <MetricCard title={t('admin.analytics.sportsVolume')} value={formatCurrency(sports.totalStake)} subtitle={t('admin.analytics.betsSuffix', { count: formatNumber(sports.betCount, locale) })} color="text-success" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard title={t('admin.analytics.totalDeposit')} value={formatCurrency(finance.totalDeposit)} color="text-success" />
        <MetricCard title={t('admin.analytics.totalWithdraw')} value={formatCurrency(finance.totalWithdraw)} color="text-danger" />
        <MetricCard title={t('admin.analytics.pendingDeposits')} value={formatNumber(pending.deposits, locale)} subtitle={t('admin.analytics.awaitingApproval')} color="text-warning" />
        <MetricCard title={t('admin.analytics.pendingWithdraws')} value={formatNumber(pending.withdraws, locale)} subtitle={t('admin.analytics.awaitingApproval')} color="text-warning" />
      </div>
    </div>
  );
}

function UsersTab() {
  const { t, locale } = useTranslation();
  const { data, error, loading } = useApiData('/admin/analytics/users?days=30');
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  const registrations = data.registrations || [];
  const balanceBuckets = data.balanceBuckets || [];
  const hourlyActivity = data.hourlyActivity || [];
  const totalRegistrations = registrations.reduce((sum, row) => sum + (row.count || 0), 0);
  const activePct = totalRegistrations > 0 ? (data.activeUsers / totalRegistrations) * 100 : 0;
  const activePctLabel = activePct.toLocaleString(locale, { maximumFractionDigits: 1 });
  const peak = hourlyActivity.reduce((best, row) => row.count > best.count ? row : best, { count: 0, _id: null });

  return (
    <div className="space-y-6">
      <PanelTitle icon="group">{t('admin.analytics.tabUsers')}</PanelTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MetricCard title={t('admin.analytics.last30DaysRegistrations')} value={formatNumber(totalRegistrations, locale)} color="text-primary" />
        <MetricCard title={t('admin.analytics.activeUsers30d')} value={formatNumber(data.activeUsers, locale)} subtitle={t('admin.analytics.activityPct', { pct: activePctLabel })} color="text-success" />
        <MetricCard title={t('admin.analytics.peakHourlyActivity')} value={peak._id != null ? `${peak._id}:00` : '—'} color="text-warning" />
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <PanelTitle icon="edit_calendar">{t('admin.analytics.dailyRegistrations30d')}</PanelTitle>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={registrations}>
            <defs>
              <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis tick={{ fill: '#888', fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="count" name={t('admin.analytics.registration')} stroke="#8b5cf6" fill="url(#regGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="donut_small">{t('admin.analytics.balanceDistribution')}</PanelTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={balanceBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.user')} radius={[4, 4, 0, 0]}>
                {balanceBuckets.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="schedule">{t('admin.analytics.hourlyActivity')}</PanelTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${v}:00`} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.colRound')} fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function IgamesLiveStatus() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const { data: igames, error } = useApiData('/admin/igames/summary');
  if (error || !igames) return null;
  const today = igames.today || {};

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">casino</span>
          </span>
          <h3 className="min-w-0 truncate text-sm font-extrabold text-text-1">{t('admin.casinoStats.liveStatusTitle')}</h3>
        </div>
        {igames.agentError && (
          <span className="text-[11px] font-bold text-warning" title={igames.agentError}>
            ({t('admin.casinoStats.agentInfoUnavailable')})
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 mb-3">
        <MetricCard title={t('admin.casinoStats.agentBalance')} value={igames.agent?.balance !== undefined ? formatCurrency(igames.agent.balance) : '—'} subtitle={igames.agent?.currency || 'TRY'} color="text-primary" />
        <MetricCard title={t('admin.casinoStats.igamesUsers')} value={igames.igamesUserCount == null ? '—' : fmt.formatNumber(igames.igamesUserCount)} subtitle={t('admin.casinoStats.totalRegistered')} />
        <MetricCard
          title={t('admin.casinoStats.activeSessions')}
          value={igames.activeSessionCount == null ? '—' : fmt.formatNumber(igames.activeSessionCount)}
          subtitle={igames.stuckSessionCount > 0 ? t('admin.casinoStats.stuckCount', { count: fmt.formatNumber(igames.stuckSessionCount || 0) }) : t('admin.casinoStats.noIssues')}
        />
        <MetricCard
          title={t('admin.casinoStats.todayGGR')}
          value={formatCurrency(today.ggr)}
          subtitle={t('admin.casinoStats.roundsPlayers', { rounds: fmt.formatNumber(today.rounds || 0), players: fmt.formatNumber(today.uniqueUsers || 0) })}
          color="text-success"
        />
      </div>
      {igames.stuckSessionCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">warning</span>
          <span>{t('admin.casinoStats.stuckSessionsHint', { count: fmt.formatNumber(igames.stuckSessionCount || 0) })}</span>
        </div>
      )}
    </div>
  );
}

function TopSpendingUsers() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const { data: users, error, loading } = useApiData('/admin/casino/stats');
  if (loading) return <LoadingState />;
  if (error) return <ErrorState />;
  const rows = Array.isArray(users?.topUsers) ? users.topUsers : [];

  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4">
      <PanelTitle icon="leaderboard">{t('admin.casinoStats.topSpendingUsers')}</PanelTitle>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">person_off</span>
          <div className="mt-2 text-sm text-text-3">{t('admin.casinoStats.noDataYet')}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((u, i) => (
            <div key={String(u._id)} className="flex items-center gap-3 bg-bg-hover rounded-lg p-2.5">
              <span className="text-xs text-text-3 w-5 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-1 font-medium truncate">{u.user?.username || t('admin.casinoStats.unknown')}</div>
                <div className="text-[10px] text-text-3">{t('admin.casinoStats.roundsCount', { count: fmt.formatNumber(u.rounds || 0) })}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-primary">{formatCurrency(u.totalBet)}</div>
                <div className={`text-[10px] ${u.ggr >= 0 ? 'text-success' : 'text-danger'}`}>GGR: {u.ggr >= 0 ? '+' : ''}{formatCurrency(u.ggr)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CasinoTab() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const { data, error, loading } = useApiData('/admin/analytics/casino?days=30');
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  const perGame = data.perGame || [];
  const providerStats = data.providerStats || [];
  const dailyTrend = data.dailyTrend || [];
  const topGames = perGame.slice(0, 10);

  return (
    <div className="space-y-6">
      <PanelTitle icon="casino">{t('admin.analytics.tabCasino')}</PanelTitle>
      <IgamesLiveStatus />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MetricCard title={t('admin.analytics.totalRounds')} value={formatNumber(perGame.reduce((s, g) => s + (g.rounds || 0), 0), locale)} color="text-warning" />
        <MetricCard title={t('admin.analytics.totalBets')} value={formatCurrency(perGame.reduce((s, g) => s + (g.totalBet || 0), 0))} color="text-primary" />
        <MetricCard title={t('admin.analytics.totalGGR')} value={formatCurrency(perGame.reduce((s, g) => s + (g.ggr || 0), 0))} color="text-success" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="sports_esports">{t('admin.analytics.top10Games')}</PanelTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topGames} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => formatMoney(v)} />
              <YAxis type="category" dataKey="gameTitle" tick={{ fill: '#888', fontSize: 9 }} width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ggr" name={`GGR (${getActiveCurrency().symbol})`} radius={[0, 4, 4, 0]}>
                {topGames.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="hub">{t('admin.analytics.providerDistribution')}</PanelTitle>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={providerStats} dataKey="ggr" nameKey="_id" cx="50%" cy="50%" outerRadius={90} label={({ _id, ggr }) => `${_id} ${formatMoney(ggr || 0)}`}>
                {providerStats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <PanelTitle icon="show_chart">{t('admin.analytics.dailyCasinoVolume30d')}</PanelTitle>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dailyTrend}>
            <defs>
              <linearGradient id="casinoBet" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
              <linearGradient id="casinoGgr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => formatMoney(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area type="monotone" dataKey="bet" name={`${t('admin.analytics.colBet')} (${getActiveCurrency().symbol})`} stroke="#f59e0b" fill="url(#casinoBet)" strokeWidth={2} />
            <Area type="monotone" dataKey="ggr" name={`GGR (${getActiveCurrency().symbol})`} stroke="#10b981" fill="url(#casinoGgr)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <TopSpendingUsers />

      <div className="bg-bg-card border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/10 p-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">table_chart</span>
            </span>
             <h3 className="min-w-0 truncate text-sm font-extrabold text-text-1">{t('admin.analytics.gameDetailTable')}</h3>
          </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-3 border-b border-white/10">
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.colGame')}</th>
                <th className="hidden p-3 text-left text-[11px] font-bold uppercase tracking-[0.07em] sm:table-cell">{t('admin.analytics.colProvider')}</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.colRound')}</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.colBet')}</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.colPayout')}</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">GGR</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">RTP</th>
                <th className="hidden p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em] md:table-cell">{t('admin.analytics.colPlayer')}</th>
              </tr>
            </thead>
            <tbody>
              {perGame.map(g => (
                <tr key={g._id} className="border-b border-white/5 hover:bg-bg-hover transition">
                  <td className="p-3 text-text-1 font-medium">{g.gameTitle || g._id}</td>
                  <td className="p-3 text-text-3 hidden sm:table-cell">{g.provider || '-'}</td>
                  <td className="p-3 text-right text-text-2">{formatNumber(g.rounds, locale)}</td>
                  <td className="p-3 text-right text-text-2">{formatCurrency(g.totalBet)}</td>
                  <td className="p-3 text-right text-text-2">{formatCurrency(g.totalPayout)}</td>
                  <td className={`p-3 text-right font-semibold ${g.ggr >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(g.ggr)}</td>
                  <td className={`p-3 text-right ${g.rtp > 100 ? 'text-danger' : 'text-text-2'}`}>{g.rtp != null ? fmt.formatPercent(g.rtp / 100) : '—'}</td>
                  <td className="p-3 text-right text-text-3 hidden md:table-cell">{formatNumber(g.uniquePlayerCount, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceTab() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const { data, error, loading } = useApiData('/admin/analytics/finance?days=30');
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  const processedDaily = [];
  const dateMap = {};
  (data.dailyFlow || []).forEach(d => {
    if (!d?._id?.date) return;
    const date = d._id.date;
    if (!dateMap[date]) dateMap[date] = { date };
    dateMap[date][d._id.type] = Math.abs(d.total || 0);
  });
  Object.keys(dateMap).sort().forEach(d => processedDaily.push(dateMap[d]));

  const typeLabels = {
    deposit: t('admin.analytics.typeLabel.deposit'), withdraw: t('admin.analytics.typeLabel.withdraw'),
    crypto_deposit: t('admin.analytics.typeLabel.cryptoDeposit'), crypto_withdraw: t('admin.analytics.typeLabel.cryptoWithdraw'),
    bet: t('admin.analytics.typeLabel.bet'), win: t('admin.analytics.typeLabel.win'), bonus: t('admin.analytics.typeLabel.bonus'),
    refund: t('admin.analytics.typeLabel.refund'), admin_adjustment: t('admin.analytics.typeLabel.adminAdjustment'),
  };

  // Not: bankOnlyDeposit'i typeBreakdown'daki toplam 'deposit'ten Slikair'i
  // ÇIKARARAK türetmiyoruz — iki aggregation farklı eşleşme koşulları
  // kullanıyor (typeBreakdown tüm zamanlar, depositProviderBreakdown günlük
  // pencereyle hizalı), aradaki fark kayarsa Math.max(0,...) sessizce yanlış
  // bir rakama yuvarlardı. depositProviderBreakdown zaten 'bank' bucket'ını
  // aynı aggregation'da doğrudan üretiyor (analytics.js:268), onu kullan.
  const typeBreakdown = data.typeBreakdown || [];
  const bankOnlyDeposit = data.depositProviderBreakdown?.find(x => x._id === 'bank')?.total || 0;
  const slikairDepositTotal = data.depositProviderBreakdown?.find(x => x._id === 'slikair')?.total || 0;

  return (
    <div className="space-y-6">
      <PanelTitle icon="payments">{t('admin.analytics.tabFinance')}</PanelTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard title={t('admin.analytics.bankDeposit')} value={formatCurrency(bankOnlyDeposit)} color="text-success" />
        <MetricCard title={t('admin.analytics.slikairDeposit')} value={formatCurrency(slikairDepositTotal)} color="text-success" />
        <MetricCard title={t('admin.analytics.bankWithdraw')} value={formatCurrency(typeBreakdown.find(x => x._id === 'withdraw')?.total || 0)} color="text-danger" />
        <MetricCard title={t('admin.analytics.cryptoDeposit')} value={formatCurrency(typeBreakdown.find(x => x._id === 'crypto_deposit')?.total || 0)} color="text-warning" />
        <MetricCard title={t('admin.analytics.cryptoWithdraw')} value={formatCurrency(typeBreakdown.find(x => x._id === 'crypto_withdraw')?.total || 0)} color="text-warning" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="account_balance">{t('admin.analytics.dailyMoneyFlow30d')}</PanelTitle>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={processedDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 9 }} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => formatMoney(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="deposit" name={t('admin.analytics.typeLabel.deposit')} stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="crypto_deposit" name={t('admin.analytics.typeLabel.cryptoDeposit')} stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="withdraw" name={t('admin.analytics.typeLabel.withdraw')} stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="crypto_withdraw" name={t('admin.analytics.typeLabel.cryptoWithdraw')} stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="donut_small">{t('admin.analytics.transactionTypeDistribution')}</PanelTitle>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={typeBreakdown.filter(item => !['bet', 'win', 'refund'].includes(item._id))} dataKey="total" nameKey="_id" cx="50%" cy="50%" outerRadius={90} label={({ _id, total }) => `${typeLabels[_id] || _id} ${formatCurrency(total)}`}>
                {typeBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.pendingWithdrawCount > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-4 text-center">
          <div className="font-mono text-lg font-bold tabular-nums text-warning">{formatCurrency(data.pendingWithdrawTotal)}</div>
          <div className="mt-1 text-xs text-text-2">{t('admin.analytics.pendingWithdrawRequest', { count: fmt.formatNumber(data.pendingWithdrawCount || 0) })}</div>
        </div>
      )}
    </div>
  );
}

function SportsTab() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const { data, error, loading } = useApiData('/admin/analytics/sports?days=30');
  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState />;

  const dailyBets = data.dailyBets || [];
  const popularSports = data.popularSports || [];
  const averageStake = data.averageStake || [];
  const winRate = data.winRate || { won: 0, lost: 0, wonAmount: 0, totalStake: 0 };
  const winPct = winRate.won + winRate.lost > 0 ? (winRate.won / (winRate.won + winRate.lost)) * 100 : 0;
  const pieData = [
    { name: t('admin.analytics.won'), value: winRate.won || 0 },
    { name: t('admin.analytics.lost'), value: winRate.lost || 0 },
  ];

  return (
    <div className="space-y-6">
      <PanelTitle icon="sports_soccer">{t('admin.analytics.tabSports')}</PanelTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard title={t('admin.analytics.totalBets')} value={formatNumber(dailyBets.reduce((s, d) => s + (d.count || 0), 0), locale)} subtitle={t('admin.analytics.days30')} color="text-primary" />
        <MetricCard title={t('admin.analytics.totalVolume')} value={formatCurrency(dailyBets.reduce((s, d) => s + (d.totalStake || 0), 0))} color="text-primary" />
        <MetricCard title={t('admin.analytics.winRate')} value={fmt.formatPercent(winPct / 100)} subtitle={t('admin.analytics.wonVsLost', { won: fmt.formatNumber(winRate.won || 0), lost: fmt.formatNumber(winRate.lost || 0) })} color="text-success" />
        <MetricCard title={t('admin.analytics.netWin')} value={formatCurrency(winRate.wonAmount - winRate.totalStake)} subtitle={t('admin.analytics.perPlayer')} color={winRate.wonAmount >= winRate.totalStake ? 'text-danger' : 'text-success'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="show_chart">{t('admin.analytics.dailyBetVolume30d')}</PanelTitle>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyBets}>
              <defs>
                <linearGradient id="betGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => formatMoney(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="totalStake" name={t('admin.analytics.betVolume', { symbol: getActiveCurrency().symbol })} stroke="#3b82f6" fill="url(#betGrad)" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="count" name={t('admin.analytics.betCount')} stroke="#10b981" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="donut_small">{t('admin.analytics.winLossRatio')}</PanelTitle>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ name, value }) => `${name}: ${fmt.formatNumber(value)}`}>
                <Cell fill="#10b981" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="sports">{t('admin.analytics.popularSports')}</PanelTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={popularSports} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis type="category" dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.betCount')} radius={[0, 4, 4, 0]}>
                {popularSports.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <PanelTitle icon="query_stats">{t('admin.analytics.avgBetAmount30d')}</PanelTitle>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={averageStake}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => formatMoney(v)} domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="avgStake" name={t('admin.analytics.avgBet', { symbol: getActiveCurrency().symbol })} stroke="#ec4899" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <PanelTitle icon="trophy">{t('admin.analytics.popularLeaguesSports')}</PanelTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-3 border-b border-white/10">
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.colLeagueSport')}</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.betCount')}</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.07em]">{t('admin.analytics.totalVolume')}</th>
              </tr>
            </thead>
            <tbody>
              {popularSports.map(s => (
                <tr key={s._id} className="border-b border-white/5 hover:bg-bg-hover transition">
                  <td className="p-3 text-text-1 font-medium">{s._id}</td>
                  <td className="p-3 text-right text-text-2">{formatNumber(s.count, locale)}</td>
                  <td className="p-3 text-right text-text-2">{formatCurrency(s.totalStake)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TAB_COMPONENTS = {
  overview: OverviewTab,
  users: UsersTab,
  casino: CasinoTab,
  finance: FinanceTab,
  sports: SportsTab,
};

export default function AdminAnalytics() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const TABS = [
    { key: 'overview', icon: 'monitoring', label: t('admin.analytics.tabOverview') },
    { key: 'users',    icon: 'group', label: t('admin.analytics.tabUsers') },
    { key: 'casino',   icon: 'casino', label: t('admin.analytics.tabCasino') },
    { key: 'finance',  icon: 'payments', label: t('admin.analytics.tabFinance') },
    { key: 'sports',   icon: 'sports_soccer', label: t('admin.analytics.tabSports') },
  ];

  const TabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupOverview') }, { label: t('admin.analytics.title') }]}
        title={t('admin.analytics.title')}
        actions={activeTab === 'casino' ? (
          <Link to="/admin/igames" className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">casino</span>
            {t('admin.casinoStats.igamesManagement')}
          </Link>
        ) : null}
      >
        <AdminTabs
          items={TABS}
          value={activeTab}
          onChange={key => setActiveTab(key)}
        />
      </AdminPageHeader>

      <TabComponent />
    </div>
  );
}
