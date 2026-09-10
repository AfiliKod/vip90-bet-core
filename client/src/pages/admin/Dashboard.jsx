import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { getActiveCurrency } from '../../utils/money.js';
import { useOnlineCount } from '../../hooks/useOnlineCount';

const CASINO_COLOR = '#8b5cf6';
const SPORTS_COLOR = '#f59e0b';

function formatCurrency(v) {
  const symbol = getActiveCurrency().symbol;
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${symbol}${(n / 1000).toFixed(1)}B`;
  return `${symbol}${n.toFixed(0)}`;
}

function KpiCard({ icon, label, value, sub }) {
  return (
    <div className="bg-bg-card border border-white/10 rounded-2xl p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-text-3 font-semibold">{label}</span>
        <span className="text-base opacity-75">{icon}</span>
      </div>
      <div className="text-2xl font-black text-text-1 tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-xs text-text-3">{sub}</div>}
    </div>
  );
}

const RANGE_OPTIONS = [7, 30, 90];

export default function AdminDashboard() {
  const { t, locale } = useTranslation();
  const [pendingBank, setPendingBank] = useState(0);
  const [pendingCrypto, setPendingCrypto] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [overview, setOverview] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [range, setRange] = useState(7);
  const onlineCount = useOnlineCount();

  useEffect(() => {
    Promise.all([
      api.get('/bank/admin/pending?type=deposit'),
      api.get('/bank/admin/pending?type=withdraw'),
    ]).then(([d, w]) => setPendingBank(d.data.requests.length + w.data.requests.length)).catch(() => {});
    Promise.all([
      api.get('/admin/crypto/pending-deposits').catch(() => ({ data: [] })),
      api.get('/admin/crypto/pending-withdrawals').catch(() => ({ data: [] })),
    ]).then(([d, w]) => setPendingCrypto(d.data.length + w.data.length)).catch(() => {});
    api.get('/tickets', { params: { status: 'open' } }).then(({ data }) => setOpenTickets(data.length)).catch(() => {});
    api.get('/admin/analytics/overview').then(({ data }) => setOverview(data)).catch(() => {});
    api.get('/admin/analytics/revenue-overview', { params: { days: 90 } }).then(({ data }) => setRevenue(data)).catch(() => {});
  }, []);

  const pendingPayments = pendingBank + pendingCrypto;
  const pendingTotal = pendingPayments + openTickets;

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', { day: '2-digit', month: 'short' }),
    [locale],
  );

  const sliced = useMemo(() => {
    if (!revenue?.series) return [];
    const rows = revenue.series.slice(-range);
    return rows.map(r => ({ ...r, label: dateFmt.format(new Date(r.date)) }));
  }, [revenue, range, dateFmt]);

  const rangeTotals = useMemo(() => {
    const casino = sliced.reduce((s, r) => s + r.casino, 0);
    const sports = sliced.reduce((s, r) => s + r.sports, 0);
    return { casino, sports, total: casino + sports };
  }, [sliced]);

  const splitData = useMemo(() => {
    if (rangeTotals.total <= 0) return [];
    return [
      { name: t('admin.dashboard.revenue.legendCasino'), value: rangeTotals.casino, color: CASINO_COLOR },
      { name: t('admin.dashboard.revenue.legendSports'), value: rangeTotals.sports, color: SPORTS_COLOR },
    ];
  }, [rangeTotals, t]);

  const tickInterval = Math.max(0, Math.ceil(sliced.length / 6) - 1);
  const casinoPct = rangeTotals.total > 0 ? Math.round((rangeTotals.casino / rangeTotals.total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">⚙️ {t('admin.dashboard.pageTitle')}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard
          icon="👥"
          label={t('admin.dashboard.kpi.totalUsers')}
          value={overview ? overview.users.total.toLocaleString('tr-TR') : '—'}
          sub={overview ? t('admin.dashboard.kpi.newToday', { count: overview.users.newToday }) : null}
        />
        <KpiCard
          icon="💰"
          label={t('admin.dashboard.kpi.todayRevenue')}
          value={revenue ? formatCurrency(revenue.today.total) : '—'}
          sub={revenue ? t('admin.dashboard.kpi.revenueBreakdown', { casino: formatCurrency(revenue.today.casino), sports: formatCurrency(revenue.today.sports) }) : null}
        />
        <KpiCard
          icon="🔔"
          label={t('admin.dashboard.kpi.pendingActions')}
          value={pendingTotal}
          sub={t('admin.dashboard.kpi.pendingBreakdown', { payments: pendingPayments, tickets: openTickets })}
        />
        <KpiCard
          icon="🟢"
          label={t('admin.dashboard.kpi.online')}
          value={onlineCount.toLocaleString('tr-TR')}
          sub={t('admin.dashboard.kpi.onlineSub')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 md:items-stretch">
        <div className="md:col-span-3 bg-bg-card border border-white/10 rounded-2xl p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <h3 className="text-sm font-bold text-text-1">{t('admin.dashboard.revenue.title')}</h3>
              <p className="text-xs text-text-3 mt-0.5">{t('admin.dashboard.revenue.hint')}</p>
            </div>
            <div className="inline-flex bg-bg-hover border border-white/10 rounded-lg p-0.5 gap-0.5 shrink-0">
              {RANGE_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition ${
                    range === r ? 'bg-primary text-bg-deep' : 'text-text-3 hover:text-text-1'
                  }`}
                >
                  {t(`admin.dashboard.revenue.range${r}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 my-2">
            <div className="flex items-center gap-1.5 text-xs text-text-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CASINO_COLOR }} />
              {t('admin.dashboard.revenue.legendCasino')}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SPORTS_COLOR }} />
              {t('admin.dashboard.revenue.legendSports')}
            </div>
          </div>

          <div className="flex-1 min-h-[200px]">
            {!revenue ? (
              <div className="h-full flex items-center justify-center text-text-3 text-sm">{t('common.loading')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={sliced} margin={{ top: 4, right: 18, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGradCasino" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CASINO_COLOR} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={CASINO_COLOR} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashGradSports" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SPORTS_COLOR} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={SPORTS_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: '#4a5a78', fontSize: 10 }} interval={tickInterval} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#4a5a78', fontSize: 10 }} tickFormatter={formatCurrency} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(value), name]}
                    contentStyle={{ background: '#111d30', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#8a9bc0' }}
                  />
                  <Legend wrapperStyle={{ display: 'none' }} />
                  <Area type="monotone" dataKey="casino" name={t('admin.dashboard.revenue.legendCasino')} stroke={CASINO_COLOR} fill="url(#dashGradCasino)" strokeWidth={2} />
                  <Area type="monotone" dataKey="sports" name={t('admin.dashboard.revenue.legendSports')} stroke={SPORTS_COLOR} fill="url(#dashGradSports)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex gap-6 mt-3 pt-3 border-t border-white/10">
            <div className="text-[11px] text-text-3">
              {t('admin.dashboard.revenue.totalCasino')}
              <b className="block text-sm font-extrabold text-text-1 mt-0.5 tabular-nums">{formatCurrency(rangeTotals.casino)}</b>
            </div>
            <div className="text-[11px] text-text-3">
              {t('admin.dashboard.revenue.totalSports')}
              <b className="block text-sm font-extrabold text-text-1 mt-0.5 tabular-nums">{formatCurrency(rangeTotals.sports)}</b>
            </div>
            <div className="text-[11px] text-text-3">
              {t('admin.dashboard.revenue.totalAll')}
              <b className="block text-sm font-extrabold text-text-1 mt-0.5 tabular-nums">{formatCurrency(rangeTotals.total)}</b>
            </div>
          </div>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center">
          <h3 className="text-sm font-bold text-text-1 self-start mb-3">{t('admin.dashboard.split.title')}</h3>
          {!revenue ? (
            <div className="flex-1 flex items-center justify-center text-text-3 text-sm">{t('common.loading')}</div>
          ) : rangeTotals.total <= 0 ? (
            <div className="flex-1 w-full flex flex-col items-center justify-center gap-4">
              <span className="text-text-3 text-xs text-center">{t('admin.dashboard.split.noPositiveData')}</span>
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CASINO_COLOR }} />
                  <span className="text-text-2 flex-1 text-left">{t('admin.dashboard.revenue.legendCasino')}</span>
                  <span className="text-text-1 font-bold tabular-nums">{formatCurrency(rangeTotals.casino)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SPORTS_COLOR }} />
                  <span className="text-text-2 flex-1 text-left">{t('admin.dashboard.revenue.legendSports')}</span>
                  <span className="text-text-1 font-bold tabular-nums">{formatCurrency(rangeTotals.sports)}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="relative w-[132px] h-[132px] my-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={splitData} dataKey="value" innerRadius={40} outerRadius={58} startAngle={90} endAngle={-270} stroke="none">
                      {splitData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black tabular-nums" style={{ color: CASINO_COLOR }}>{casinoPct}%</span>
                  <span className="text-[9px] uppercase tracking-wide text-text-3 mt-0.5">{t('admin.dashboard.revenue.legendCasino')}</span>
                </div>
              </div>
              <div className="w-full flex flex-col gap-2 mt-auto pt-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CASINO_COLOR }} />
                  <span className="text-text-2 flex-1 text-left">{t('admin.dashboard.revenue.legendCasino')}</span>
                  <span className="text-text-1 font-bold tabular-nums">{formatCurrency(rangeTotals.casino)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SPORTS_COLOR }} />
                  <span className="text-text-2 flex-1 text-left">{t('admin.dashboard.revenue.legendSports')}</span>
                  <span className="text-text-1 font-bold tabular-nums">{formatCurrency(rangeTotals.sports)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/admin/users" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">👥</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.users.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.users.desc')}</div>
        </Link>
        <Link to="/admin/bank" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center relative">
          {pendingPayments > 0 && (
            <span className="absolute top-3 right-3 bg-accent text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {pendingPayments}
            </span>
          )}
          <div className="text-3xl mb-2">💳</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.payments.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.payments.desc')}</div>
        </Link>
        <Link to="/admin/analytics" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">📈</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.analytics.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.analytics.desc')}</div>
        </Link>
        <Link to="/admin/settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">⚙️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.settingsCard.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.settingsCard.desc')}</div>
        </Link>
        <Link to="/admin/modules" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🧩</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.modules.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.modules.desc')}</div>
        </Link>
        <Link to="/admin/theme" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🎨</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.theme.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.theme.desc')}</div>
        </Link>
        <Link to="/admin/branding" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🏷️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.branding.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.branding.desc')}</div>
        </Link>
        <Link to="/admin/pages" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center">
          <div className="text-3xl mb-2">🎞️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.pages.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.pages.desc')}</div>
        </Link>
        <Link to="/admin/promotions" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🎁</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.promotions.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.promotions.desc')}</div>
        </Link>
        <Link to="/admin/game-settings" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🎛️</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.gameSettings.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.gameSettings.desc')}</div>
        </Link>
        <Link to="/admin/vip" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">💎</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.vip.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.vip.desc')}</div>
        </Link>
        <Link to="/admin/bots" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">🏆</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.bots.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.bots.desc')}</div>
        </Link>
        <Link to="/admin/static-pages" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-primary/30 transition text-center">
          <div className="text-3xl mb-2">📄</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.staticPages.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.staticPages.desc')}</div>
        </Link>
        <Link to="/admin/tickets" className="bg-bg-card border border-white/10 rounded-xl p-5 hover:border-accent/30 transition text-center relative">
          {openTickets > 0 && (
            <span className="absolute top-3 right-3 bg-accent text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
              {openTickets}
            </span>
          )}
          <div className="text-3xl mb-2">🎫</div>
          <div className="font-semibold text-text-1">{t('admin.dashboard.tickets.title')}</div>
          <div className="text-text-3 text-sm mt-1">{t('admin.dashboard.tickets.desc')}</div>
        </Link>
      </div>
    </div>
  );
}
