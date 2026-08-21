import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { formatMoney, getActiveCurrency } from '../../utils/money.js';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = ['#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const PIE_COLORS = ['#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

function formatCurrency(v) {
  const symbol = getActiveCurrency().symbol;
  if (v >= 1000000) return `${symbol}${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${symbol}${(v / 1000).toFixed(1)}B`;
  return `${symbol}${Number(v).toFixed(0)}`;
}

function formatNumber(v) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}B`;
  return Number(v).toFixed(0);
}

function MetricCard({ title, value, subtitle, color }) {
  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4">
      <div className="text-xs text-text-3 mb-1">{title}</div>
      <div className={`text-2xl font-black ${color || 'text-text-1'}`}>{value}</div>
      {subtitle && <div className="text-xs text-text-3 mt-1">{subtitle}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-white/20 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-text-3 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-2">{p.name}: <strong className="text-text-1">{typeof p.value === 'number' ? p.name?.includes(getActiveCurrency().symbol) || p.name?.includes('Tutar') || p.value > 1000 ? formatCurrency(p.value) : formatNumber(p.value) : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

function OverviewTab() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/analytics/overview').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-center text-text-3 py-12 text-sm">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title={t('admin.analytics.totalUsers')} value={formatNumber(data.users.total)} subtitle={t('admin.analytics.newToday', { count: data.users.newToday })} color="text-purple-400" />
        <MetricCard title={t('admin.analytics.totalBets')} value={formatNumber(data.bets.total)} subtitle={t('admin.analytics.pendingCount', { count: data.bets.pending })} color="text-blue-400" />
        <MetricCard title={t('admin.analytics.casinoRounds')} value={formatNumber(data.casino.totalRounds)} subtitle={`GGR ${formatCurrency(data.casino.ggr)}`} color="text-amber-400" />
        <MetricCard title={t('admin.analytics.sportsVolume')} value={formatCurrency(data.sports.totalStake)} subtitle={t('admin.analytics.betsSuffix', { count: formatNumber(data.sports.betCount) })} color="text-green-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title={t('admin.analytics.totalDeposit')} value={formatCurrency(data.finance.totalDeposit)} color="text-emerald-400" />
        <MetricCard title={t('admin.analytics.totalWithdraw')} value={formatCurrency(data.finance.totalWithdraw)} color="text-red-400" />
        <MetricCard title={t('admin.analytics.pendingDeposits')} value={formatNumber(data.pending.deposits)} subtitle={t('admin.analytics.awaitingApproval')} color="text-yellow-400" />
        <MetricCard title={t('admin.analytics.pendingWithdraws')} value={formatNumber(data.pending.withdraws)} subtitle={t('admin.analytics.awaitingApproval')} color="text-orange-400" />
      </div>
    </div>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/analytics/users?days=30').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-center text-text-3 py-12 text-sm">{t('common.loading')}</div>;

  const activePct = data.registrations.length > 0 ? ((data.activeUsers / (data.registrations.reduce((s, r) => s + r.count, 0))) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard title={t('admin.analytics.last30DaysRegistrations')} value={formatNumber(data.registrations.reduce((s, r) => s + r.count, 0))} color="text-purple-400" />
        <MetricCard title={t('admin.analytics.activeUsers30d')} value={formatNumber(data.activeUsers)} subtitle={t('admin.analytics.activityPct', { pct: activePct })} color="text-green-400" />
        <MetricCard title={t('admin.analytics.peakHourlyActivity')} value={data.hourlyActivity?.reduce((a, b) => a.count > b.count ? a : b, { count: 0 })._id + ':00' || '-'} color="text-amber-400" />
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.dailyRegistrations30d')}</h4>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.registrations}>
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
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.balanceDistribution')}</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.balanceBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.user')} radius={[4, 4, 0, 0]}>
                {data.balanceBuckets.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.hourlyActivity')}</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${v}:00`} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Round" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CasinoTab() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/analytics/casino?days=30').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-center text-text-3 py-12 text-sm">{t('common.loading')}</div>;

  const topGames = data.perGame?.slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard title={t('admin.analytics.totalRounds')} value={formatNumber(data.perGame?.reduce((s, g) => s + g.rounds, 0) || 0)} color="text-amber-400" />
        <MetricCard title={t('admin.analytics.totalBets')} value={formatCurrency(data.perGame?.reduce((s, g) => s + g.totalBet, 0) || 0)} color="text-blue-400" />
        <MetricCard title={t('admin.analytics.totalGGR')} value={formatCurrency(data.perGame?.reduce((s, g) => s + g.ggr, 0) || 0)} color="text-green-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.top10Games')}</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topGames} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${getActiveCurrency().symbol}${v.toFixed(0)}`} />
              <YAxis type="category" dataKey="gameTitle" tick={{ fill: '#888', fontSize: 9 }} width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ggr" name={`GGR (${getActiveCurrency().symbol})`} radius={[0, 4, 4, 0]}>
                {topGames.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.providerDistribution')}</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.providerStats} dataKey="ggr" nameKey="_id" cx="50%" cy="50%" outerRadius={90} label={({ _id, ggr }) => `${_id} ${formatMoney(ggr || 0)}`}>
                {data.providerStats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.dailyCasinoVolume30d')}</h4>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.dailyTrend}>
            <defs>
              <linearGradient id="casinoBet" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
              <linearGradient id="casinoGgr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
            <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${getActiveCurrency().symbol}${(v / 1000).toFixed(0)}B`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area type="monotone" dataKey="bet" name={`Bahis (${getActiveCurrency().symbol})`} stroke="#f59e0b" fill="url(#casinoBet)" strokeWidth={2} />
            <Area type="monotone" dataKey="ggr" name={`GGR (${getActiveCurrency().symbol})`} stroke="#10b981" fill="url(#casinoGgr)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl overflow-hidden">
        <h4 className="text-sm font-semibold text-text-1 p-4 border-b border-white/10">{t('admin.analytics.gameDetailTable')}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-3 border-b border-white/10">
                <th className="text-left p-3 font-medium">{t('admin.analytics.colGame')}</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">{t('admin.analytics.colProvider')}</th>
                <th className="text-right p-3 font-medium">Round</th>
                <th className="text-right p-3 font-medium">{t('admin.analytics.colBet')}</th>
                <th className="text-right p-3 font-medium">{t('admin.analytics.colPayout')}</th>
                <th className="text-right p-3 font-medium">GGR</th>
                <th className="text-right p-3 font-medium">RTP</th>
                <th className="text-right p-3 font-medium hidden md:table-cell">{t('admin.analytics.colPlayer')}</th>
              </tr>
            </thead>
            <tbody>
              {data.perGame?.map(g => (
                <tr key={g._id} className="border-b border-white/5 hover:bg-bg-hover transition">
                  <td className="p-3 text-text-1 font-medium">{g.gameTitle || g._id}</td>
                  <td className="p-3 text-text-3 hidden sm:table-cell">{g.provider || '-'}</td>
                  <td className="p-3 text-right text-text-2">{formatNumber(g.rounds)}</td>
                  <td className="p-3 text-right text-text-2">{formatCurrency(g.totalBet)}</td>
                  <td className="p-3 text-right text-text-2">{formatCurrency(g.totalPayout)}</td>
                  <td className={`p-3 text-right font-semibold ${g.ggr >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(g.ggr)}</td>
                  <td className={`p-3 text-right ${g.rtp > 100 ? 'text-danger' : 'text-text-2'}`}>{g.rtp?.toFixed(1)}%</td>
                  <td className="p-3 text-right text-text-3 hidden md:table-cell">{g.uniquePlayerCount}</td>
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
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/analytics/finance?days=30').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-center text-text-3 py-12 text-sm">{t('common.loading')}</div>;

  const processedDaily = [];
  const dateMap = {};
  data.dailyFlow?.forEach(d => {
    const date = d._id.date;
    if (!dateMap[date]) dateMap[date] = { date };
    dateMap[date][d._id.type] = Math.abs(d.total);
  });
  Object.keys(dateMap).sort().forEach(d => processedDaily.push(dateMap[d]));

  const typeLabels = {
    deposit: t('admin.analytics.typeLabel.deposit'), withdraw: t('admin.analytics.typeLabel.withdraw'),
    crypto_deposit: t('admin.analytics.typeLabel.cryptoDeposit'), crypto_withdraw: t('admin.analytics.typeLabel.cryptoWithdraw'),
    bet: t('admin.analytics.typeLabel.bet'), win: t('admin.analytics.typeLabel.win'), bonus: t('admin.analytics.typeLabel.bonus'),
    refund: t('admin.analytics.typeLabel.refund'), admin_adjustment: t('admin.analytics.typeLabel.adminAdjustment'),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard title={t('admin.analytics.bankDeposit')} value={formatCurrency(data.typeBreakdown?.find(t => t._id === 'deposit')?.total || 0)} color="text-emerald-400" />
        <MetricCard title={t('admin.analytics.bankWithdraw')} value={formatCurrency(data.typeBreakdown?.find(t => t._id === 'withdraw')?.total || 0)} color="text-red-400" />
        <MetricCard title={t('admin.analytics.cryptoDeposit')} value={formatCurrency(data.typeBreakdown?.find(t => t._id === 'crypto_deposit')?.total || 0)} color="text-amber-400" />
        <MetricCard title={t('admin.analytics.cryptoWithdraw')} value={formatCurrency(data.typeBreakdown?.find(t => t._id === 'crypto_withdraw')?.total || 0)} color="text-orange-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.dailyMoneyFlow30d')}</h4>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={processedDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 9 }} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${getActiveCurrency().symbol}${(v / 1000).toFixed(0)}B`} />
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
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.transactionTypeDistribution')}</h4>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.typeBreakdown?.filter(t => !['bet', 'win', 'refund'].includes(t._id))} dataKey="total" nameKey="_id" cx="50%" cy="50%" outerRadius={90} label={({ _id, total }) => `${typeLabels[_id] || _id} ${formatCurrency(total)}`}>
                {data.typeBreakdown?.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.pendingWithdrawCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
          <div className="text-lg font-bold text-amber-400">{formatCurrency(data.pendingWithdrawTotal)}</div>
          <div className="text-xs text-amber-300">{t('admin.analytics.pendingWithdrawRequest', { count: data.pendingWithdrawCount })}</div>
        </div>
      )}
    </div>
  );
}

function SportsTab() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/admin/analytics/sports?days=30').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="text-center text-text-3 py-12 text-sm">{t('common.loading')}</div>;

  const winRate = data.winRate;
  const winPct = winRate.won + winRate.lost > 0 ? ((winRate.won / (winRate.won + winRate.lost)) * 100).toFixed(1) : '0';
  const pieData = [
    { name: t('admin.analytics.won'), value: winRate.won },
    { name: t('admin.analytics.lost'), value: winRate.lost },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard title={t('admin.analytics.totalBets')} value={formatNumber(data.dailyBets?.reduce((s, d) => s + d.count, 0) || 0)} subtitle={t('admin.analytics.days30')} color="text-blue-400" />
        <MetricCard title={t('admin.analytics.totalVolume')} value={formatCurrency(data.dailyBets?.reduce((s, d) => s + d.totalStake, 0) || 0)} color="text-purple-400" />
        <MetricCard title={t('admin.analytics.winRate')} value={`%${winPct}`} subtitle={t('admin.analytics.wonVsLost', { won: winRate.won, lost: winRate.lost })} color="text-green-400" />
        <MetricCard title={t('admin.analytics.netWin')} value={formatCurrency(winRate.wonAmount - winRate.totalStake)} subtitle={t('admin.analytics.perPlayer')} color={winRate.wonAmount >= winRate.totalStake ? 'text-danger' : 'text-success'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.dailyBetVolume30d')}</h4>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.dailyBets}>
              <defs>
                <linearGradient id="betGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${getActiveCurrency().symbol}${(v / 1000).toFixed(0)}B`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#888', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="totalStake" name={t('admin.analytics.betVolume', { symbol: getActiveCurrency().symbol })} stroke="#3b82f6" fill="url(#betGrad)" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="count" name={t('admin.analytics.betCount')} stroke="#10b981" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.winLossRatio')}</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ name, value }) => `${name}: ${value}`}>
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
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.popularSports')}</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.popularSports} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis type="category" dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.betCount')} radius={[0, 4, 4, 0]}>
                {data.popularSports.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.avgBetAmount30d')}</h4>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.averageStake}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} tickFormatter={v => `${getActiveCurrency().symbol}${v.toFixed(0)}`} domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="avgStake" name={t('admin.analytics.avgBet', { symbol: getActiveCurrency().symbol })} stroke="#ec4899" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-text-1 mb-3">{t('admin.analytics.popularLeaguesSports')}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-3 border-b border-white/10">
                <th className="text-left p-3 font-medium">{t('admin.analytics.colLeagueSport')}</th>
                <th className="text-right p-3 font-medium">{t('admin.analytics.betCount')}</th>
                <th className="text-right p-3 font-medium">{t('admin.analytics.totalVolume')}</th>
              </tr>
            </thead>
            <tbody>
              {data.popularSports?.map(s => (
                <tr key={s._id} className="border-b border-white/5 hover:bg-bg-hover transition">
                  <td className="p-3 text-text-1 font-medium">{s._id}</td>
                  <td className="p-3 text-right text-text-2">{formatNumber(s.count)}</td>
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
    { key: 'overview', label: `📊 ${t('admin.analytics.tabOverview')}` },
    { key: 'users',    label: `👥 ${t('admin.analytics.tabUsers')}` },
    { key: 'casino',   label: `🎰 ${t('admin.analytics.tabCasino')}` },
    { key: 'finance',  label: `💰 ${t('admin.analytics.tabFinance')}` },
    { key: 'sports',   label: `⚽ ${t('admin.analytics.tabSports')}` },
  ];

  const TabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-1">📈 {t('admin.analytics.title')}</h1>
      </div>

      <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              activeTab === tab.key ? 'bg-accent text-white' : 'text-text-3 hover:text-text-1'
            }`}>{tab.label}</button>
        ))}
      </div>

      <TabComponent />
    </div>
  );
}
