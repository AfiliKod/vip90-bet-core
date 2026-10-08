import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { getActiveCurrency } from '../../utils/money.js';
import { useOnlineCount } from '../../hooks/useOnlineCount';
import { useAdminCounts } from '../../hooks/useAdminCounts';
import ActivityFeed from './components/ActivityFeed.jsx';
import AdminPageHeader, { ADMIN_BTN_GHOST, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { KPI_TONE_COLORS, hexToRgb, kpiTone, deltaTone } from './dashboard/kpiTone.js';

const CASINO_COLOR = '#8b5cf6';
const SPORTS_COLOR = '#f59e0b';

function formatCurrency(v) {
  const symbol = getActiveCurrency().symbol;
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000000) return `${symbol}${(n / 1000000000).toFixed(1)}B`;
  if (Math.abs(n) >= 1000000) return `${symbol}${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${symbol}${(n / 1000).toFixed(1)}K`;
  return `${symbol}${n.toFixed(0)}`;
}

// KPI değerleri işaretli basılır: kural "+" / "−" önekiyle başlayan SAYIYA
// bakar, işaretsiz basılan bir değerde o bilgi ekranda yoktur.
function formatSignedCurrency(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + formatCurrency(n);
}

function formatSignedCount(v, locale) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toLocaleString(locale);
}

// Kartın tüm tonu (zemin, çerçeve, ikon, değişim rozeti) sabit iki renkten
// gelir; seçilen renk kart kökünde `--kpi-accent` olarak basılır ve
// aşağıdaki sınıflar onu okur (böylece Tailwind statik sınıfları korunur).
//
// KURAL — sayı, renk ve ok birbirini ASLA çeliştirmez:
//   "+" ile başlayan sayı → yeşil  (up)    + trending_up
//   "−" ile başlayan sayı → kırmızı (down)  + trending_down
const KPI_TONES = {
  accent: {
    card: 'border-[rgb(var(--kpi-accent)/0.3)] bg-gradient-to-br from-[rgb(var(--kpi-accent)/0.16)] via-[rgb(var(--kpi-accent)/0.05)] to-bg-card',
    chip: 'bg-[rgb(var(--kpi-accent)/0.15)] text-[rgb(var(--kpi-accent))]',
    glow: 'text-[rgb(var(--kpi-accent)/0.07)]',
  },
  neutral: {
    card: 'border-white/10 bg-bg-card',
    chip: 'bg-white/5 text-text-3',
    glow: 'text-white/[0.03]',
  },
};

function accentStyle(tone) {
  const hex = KPI_TONE_COLORS[tone];
  return hex ? { '--kpi-accent': hexToRgb(hex) } : undefined;
}

function KpiCard({ icon, label, value, sub, rawValue, delta, t, locale }) {
  const tone = kpiTone(rawValue);
  const badge = deltaTone(delta);
  const cardTone = tone === 'neutral' ? KPI_TONES.neutral : KPI_TONES.accent;
  const pillTone = badge === 'neutral' ? KPI_TONES.neutral : KPI_TONES.accent;
  const hasDelta = delta != null;
  // Nötrde yön yok → ok yerine metrik ikonu. Aks halde ok işaretle uyuşur.
  const watermark = tone === 'neutral' ? icon : (tone === 'up' ? 'trending_up' : 'trending_down');
  const deltaArrow = badge === 'neutral' ? 'remove' : (badge === 'up' ? 'arrow_upward' : 'arrow_downward');
  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-xl border p-3.5 sm:p-4 ${cardTone.card}`}
      style={accentStyle(tone)}
    >
      <span
        className={`material-symbols-outlined pointer-events-none absolute -bottom-5 -right-3 !text-[96px] ${cardTone.glow}`}
        aria-hidden="true"
      >
        {watermark}
      </span>
      <div className="relative flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-2">{label}</span>
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${cardTone.chip}`}
        >
          <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">{icon}</span>
        </span>
      </div>
      <div className="relative mt-1.5 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1 sm:text-2xl">{value}</div>
      {sub && <div className="relative mt-0.5 truncate text-xs text-text-3">{sub}</div>}
      {hasDelta && (
        <div
          className={`relative mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${pillTone.chip}`}
          style={accentStyle(badge)}
        >
          <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">
            {deltaArrow}
          </span>
          {t('admin.dashboard.kpi.deltaYesterday', {
            value: new Intl.NumberFormat(locale, {
              style: 'percent',
              maximumFractionDigits: 1,
              signDisplay: 'exceptZero',
            }).format(Number(delta) / 100),
          })}
        </div>
      )}
    </article>
  );
}

// Bulgu yaşı — kaydın createdAt'ından (fixture'da sabit "3 ay" yazıyordu).
function relativeTime(createdAt, locale, t) {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return t('admin.dashboard.pendingFinance.ageMinutes', { m: Math.max(1, Math.floor(ms / 60000)) });
  if (h < 24) return t('admin.dashboard.pendingFinance.ageHours', { h });
  const d = Math.floor(h / 24);
  if (d < 30) return t('admin.dashboard.pendingFinance.ageDays', { d });
  return t('admin.dashboard.risk.agoMonths', { months: Math.floor(d / 30) });
}

// Bekleyen kaydın yaşı — kaydın kendi createdAt'ından hesaplanır.
// (Eskiden sıraya göre sabit saat/gün fixture'ı basılıyordu.)
// Sunucu `kind` → i18n anahtar segmenti (admin.dashboard.pendingFinance.kind.*).
const PENDING_KIND_KEY = {
  crypto_deposit: 'cryptoDeposit',
  crypto_withdraw: 'cryptoWithdraw',
  bank_deposit: 'bankDeposit',
  bank_withdraw: 'bankWithdraw',
};

function pendingAge(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  if (h < 1) return { key: 'admin.dashboard.pendingFinance.ageMinutes', params: { m: Math.max(1, Math.floor(ms / 60000)) } };
  if (h < 24) return { key: 'admin.dashboard.pendingFinance.ageHours', params: { h } };
  return { key: 'admin.dashboard.pendingFinance.ageDays', params: { d: Math.floor(h / 24) } };
}

// Platform sağlığı — /admin/health/system yanıtından türetilir (fixture yok).
// `pct` çubuk doluluğudur; `tone` eşiğe göre seçilir.
// GET /admin/health/system → { system: {memory, cpu, uptime}, database: {status,
// duration} }. ÖNEMLİ: alanlar `system` altındadır; düz `h.memory` okumak
// sessizce hepsini '—' gösteriyordu. Online sayısı burada YOK — dashboard'da
// zaten `useOnlineCount()` ile (socket + /health/status) geliyor.
function healthMetrics(h, onlineCount, t) {
  if (!h) return [];
  const mem = h.system?.memory || {};
  const cpu = h.system?.cpu || {};
  const db = h.database || {};
  const dbMs = Number(db.duration);
  const out = [];

  out.push({
    id: 'apiLatency',
    labelKey: 'admin.dashboard.health.apiLatency',
    text: Number.isFinite(dbMs) ? t('admin.dashboard.health.unitMs', { value: Math.round(dbMs) }) : '—',
    pct: clampPct(100 - (Number.isFinite(dbMs) ? dbMs / 5 : 50)),
    tone: Number.isFinite(dbMs) && dbMs > 200 ? 'warn' : 'ok',
  });
  out.push({
    id: 'memory',
    labelKey: 'admin.dashboard.health.memory',
    text: `${Number(mem.usagePercent || 0).toFixed(1)}%`,
    pct: clampPct(Number(mem.usagePercent || 0)),
    tone: Number(mem.usagePercent) > 90 ? 'warn' : 'ok',
  });
  out.push({
    id: 'cpuLoad',
    labelKey: 'admin.dashboard.health.cpuLoad',
    text: (cpu.loadAvg?.[0] ?? 0).toFixed(2),
    pct: clampPct(((cpu.loadAvg?.[0] ?? 0) / (cpu.cores || 1)) * 100),
    tone: (cpu.loadAvg?.[0] ?? 0) > (cpu.cores || 1) * 2 ? 'warn' : 'ok',
  });
  out.push({
    id: 'socketConnections',
    labelKey: 'admin.dashboard.health.socketConnections',
    text: Number(onlineCount ?? 0).toLocaleString(),
    pct: clampPct(Math.min(100, Number(onlineCount ?? 0) / 50)),
    tone: 'purple',
  });
  return out;
}

// Saniyeyi "3s 12dk" gibi okunur biçime çevirir (system.uptime).
function humanUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}s`;
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m}dk ${s % 60}sn`;
  return `${s}sn`;
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

const RANGE_OPTIONS = [7, 30, 90];

const QUEUE_ICONS = {
  bank: 'account_balance',
  crypto: 'currency_bitcoin',
  tickets: 'confirmation_number',
  kyc: 'badge',
  riskFlags: 'shield',
};

// Değerler locale'e göre render'da biçimlenir (birimler i18n'den gelir).

export default function AdminDashboard() {
  const { t, locale } = useTranslation();
  // Hangi tarih araligina ait oldugu ayrica tutulur: range degisince yeni
  // veri gelene kadar ESKI pencerenin rakamlari gosterilmesin (setState'i
  // effect govdesinde cagirmadan onceki degeri render sirasinda eleriz).
  const [overviewFor, setOverviewFor] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [pendingFinance, setPendingFinance] = useState([]);
  const [finFilter, setFinFilter] = useState('all');
  const [range, setRange] = useState(7);
  // Grafik satırındaki mini chart (Analytics > Sports ucu).
  const [betVolume, setBetVolume] = useState(null);
  // Canlı kuyruk sayıları (sidebar rozetleriyle AYNI store).
  const counts = useAdminCounts();
  const [findings, setFindings] = useState([]);
  const [health, setHealth] = useState(null);
  const [healthAt, setHealthAt] = useState(null); // health yanitinin alindigi an
  const onlineCount = useOnlineCount();

  useEffect(() => {
    // Bekleyen finans tablosu (liste satırları) — kuyruk SAYISI artık
    // /admin/queues/counts'tan gelir. Satırlar sunucuda normalize edilir
    // (kripto + banka, en uzun bekleyen önce, oyuncu adı/tutar/risk gerçek
    // kayıttan) — bkz. server/src/services/pendingFinance.js.
    api.get('/admin/queues/pending-finance', { params: { limit: 5 } }).then(({ data }) => {
      setPendingFinance((data?.items || []).map((r) => ({
        ref: r.ref,
        player: r.username || '—',
        amount: r.amount != null ? formatCurrency(r.amount) : '—',
        kind: r.kind,
        usdt: r.usdtAmount,
        risk: r.risk || 'medium',
        status: r.status || 'pending',
        age: pendingAge(r.createdAt),
      })));
    }).catch(() => {});
    // F3 — yüksek riskli aktivite listesi canlı uçtan
    api.get('/admin/risk/findings', { params: { limit: 5 } })
      .then(({ data }) => setFindings(data?.findings || []))
      .catch(() => {});
    // Platform sağlığı — gerçek servis ölçümleri
    // routes/health.js '/api/admin/health' altına mount EDİLİ (app.js) ve
    // client baseURL '/api' olduğu için yol '/admin/health/system' olmalı.
    // '/health/system' diye çağırmak '/api/health/system'e gidiyor ve 404 veriyor.
    api.get('/admin/health/system')
      .then(({ data }) => { setHealth(data); setHealthAt(Date.now()); })
      .catch(() => {});
    api.get('/admin/analytics/revenue-overview', { params: { days: 90 } }).then(({ data }) => setRevenue(data)).catch(() => {});
  }, []);

  // Aralığa duyarlı veri: KPI şeridi (6 kart) ve Daily Bet Volume, Revenue
  // Overview'daki 7D/30D/90D seçicisiyle aynı pencereyi gösterir.
  // Revenue Overview ve Revenue Split zaten `range`e göre `revenue.series`ten
  // dilimleniyordu; bu ikisi sunucuya `?days=` ile soruyor.
  useEffect(() => {
    let cancelled = false;
    api.get('/admin/analytics/overview', { params: { days: range } })
      .then(({ data }) => {
        if (cancelled) return;
        setOverviewData(data);
        setOverviewFor(range);
      })
      .catch(() => {});
    api.get('/admin/analytics/sports', { params: { days: range } })
      .then(({ data }) => { if (!cancelled) setBetVolume(data?.dailyBets || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [range]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }),
    [locale],
  );

  const sliced = useMemo(() => {
    if (!revenue?.series) return [];
    const rows = revenue.series.slice(-range);
    return rows.map(r => ({ ...r, label: dateFmt.format(new Date(r.date)) }));
  }, [revenue, range, dateFmt]);

  // Donut notu: casino payinin secili donemdeki degisimi. Onceki donem
  // veriden hesaplanir (sabit "+3.1 puan" fixture'i yerine).
  const casinoShareDelta = useMemo(() => {
    if (!revenue?.series?.length || range >= revenue.series.length) return 0;
    const share = (rows) => {
      const total = rows.reduce((s, r) => s + (r.casino + r.sports), 0);
      return total > 0 ? (rows.reduce((s, r) => s + r.casino, 0) / total) * 100 : 0;
    };
    const current = revenue.series.slice(-range);
    const previous = revenue.series.slice(-range * 2, -range);
    return share(current) - share(previous);
  }, [revenue, range]);

  const rangeTotals = useMemo(() => {
    const casino = sliced.reduce((s, r) => s + r.casino, 0);
    const sports = sliced.reduce((s, r) => s + r.sports, 0);
    return { casino, sports, total: casino + sports };
  }, [sliced]);

  const tickInterval = Math.max(0, Math.ceil(sliced.length / 6) - 1);
  const casinoPct = rangeTotals.total > 0 ? Math.round((rangeTotals.casino / rangeTotals.total) * 100) : 0;

  const queues = [
    { id: 'bank', label: t('admin.dashboard.queues.bank'), sub: t('admin.dashboard.queues.bankSub'), count: counts.bank, to: '/admin/wallet?tab=bank', tone: 'text-warning bg-warning/15' },
    { id: 'crypto', label: t('admin.dashboard.queues.crypto'), sub: t('admin.dashboard.queues.cryptoSub'), count: counts.crypto, to: '/admin/wallet?tab=crypto', tone: 'text-warning bg-warning/15' },
    { id: 'tickets', label: t('admin.dashboard.queues.tickets'), sub: t('admin.dashboard.queues.ticketsSub'), count: counts.tickets, to: '/admin/tickets', tone: 'text-info bg-info/15' },
    { id: 'kyc', label: t('admin.dashboard.queues.kyc'), sub: t('admin.dashboard.queues.kycSub'), count: counts.kyc, to: '/admin/compliance?tab=kyc', tone: 'text-success bg-success/15' },
    { id: 'riskFlags', label: t('admin.dashboard.queues.risk'), sub: t('admin.dashboard.queues.riskSub'), count: counts.riskFlags, to: '/admin/compliance?tab=risk', tone: 'text-danger bg-danger/15' },
  ];

  // KPI şeridi Analytics > Overview sekmesinin İLK 6 verisiyle beslenir
  // (aynı /admin/analytics/overview ucu, aynı sıra, aynı alt başlıklar).
  // Delta rozeti yok: overview bu alanlarda değişim yüzdesi dönmüyor —
  // olmayan bir sayı uydurmak yerine Analytics'teki subtitle aynen taşınır.
  // Renk/ok kuralı yine işaretten gelir: `+` → yeşil + yukarı ok.
  // Range degistirilip yeni veri gelmeden once eski pencerenin sayilari gosterilmez.
  const overview = overviewFor === range ? overviewData : null;

  const users = overview?.users || {};
  const bets = overview?.bets || {};
  const casino = overview?.casino || {};
  const sports = overview?.sports || {};
  const finance = overview?.finance || {};

  const kpis = [
    {
      id: 'totalUsers', icon: 'group', labelKey: 'admin.analytics.totalUsers',
      raw: users.total, text: formatSignedCount(users.total, locale),
      sub: overview ? t('admin.analytics.newToday', { count: Number(users.newToday || 0).toLocaleString(locale) }) : null,
    },
    {
      id: 'totalBets', icon: 'receipt_long', labelKey: 'admin.analytics.totalBets',
      raw: bets.total, text: formatSignedCount(bets.total, locale),
      sub: overview ? t('admin.analytics.pendingCount', { count: Number(bets.pending || 0).toLocaleString(locale) }) : null,
    },
    {
      id: 'casinoRounds', icon: 'casino', labelKey: 'admin.analytics.casinoRounds',
      raw: casino.totalRounds, text: formatSignedCount(casino.totalRounds, locale),
      sub: overview ? t('admin.dashboard.kpi.ggrWithAmount', { value: formatCurrency(casino.ggr) }) : null,
    },
    {
      id: 'sportsVolume', icon: 'sports_soccer', labelKey: 'admin.analytics.sportsVolume',
      raw: sports.totalStake, text: formatSignedCurrency(sports.totalStake),
      sub: overview ? t('admin.analytics.betsSuffix', { count: Number(sports.betCount || 0).toLocaleString(locale) }) : null,
    },
    {
      id: 'totalDeposit', icon: 'account_balance_wallet', labelKey: 'admin.analytics.totalDeposit',
      raw: finance.totalDeposit, text: formatSignedCurrency(finance.totalDeposit),
    },
    {
      id: 'totalWithdraw', icon: 'schedule_send', labelKey: 'admin.analytics.totalWithdraw',
      raw: finance.totalWithdraw, text: formatSignedCurrency(finance.totalWithdraw),
    },
  ].map(k => ({ ...k, label: t(k.labelKey), value: k.text, rawValue: k.raw ?? null }));

  // Servis başlama zamanı = şimdi - process uptime. Render sırasında
  // Date.now() çağırmak React safiyet kuralını ihlal ediyor (her render'da
  // farklı değer); veri geldiğinde bir kez hesaplanıyor.
  // Başlama anı = yanıt alındığı an - process uptime. `Date.now()` render
  // sırasında çağrılamaz (React safiyeti), bu yüzden an fetch'te bir kez
  // yakalanıyor ve burada yalnızca o değerden türetiliyor.
  const healthNote = useMemo(() => {
    const uptime = health?.system?.uptime;
    if (uptime == null || healthAt == null) return t('common.loading');
    const startedAt = new Date(healthAt - uptime * 1000).toLocaleString(locale);
    return t('admin.dashboard.health.deployNote', { time: startedAt, uptime: humanUptime(uptime) });
  }, [health, healthAt, locale, t]);

  const sevClass = {
    critical: 'bg-danger/20 text-danger',
    high: 'bg-warning/20 text-warning',
    medium: 'bg-gold/15 text-gold',
  };

  // Bekleyen finans segment filtresi (VIP / yüksek riskli). Risk etiketi
  // sunucuda risk profili + VIP seviyesi + KYC'den türetilir.
  const visibleFinance = pendingFinance.filter(r => {
    if (finFilter === 'vip') return r.risk === 'vip';
    if (finFilter === 'high') return r.risk === 'high';
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.dashboard.crumbsOverview') }, { label: t('admin.nav.dashboard') }]}
        title={t('admin.nav.dashboard')}
        sub={t('admin.dashboard.pageSub')}
        actions={(
          <>
            <button type="button" className={`${ADMIN_BTN_GHOST} hidden sm:inline-flex`}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">file_download</span>
              {t('admin.dashboard.exportBtn')}
            </button>
            <Link to="/admin/promotions" className={ADMIN_BTN_PRIMARY}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
              {t('admin.dashboard.newCampaignBtn')}
            </Link>
          </>
        )}
      />

      {/* KPI şeridi — Analytics > Overview ilk 6 veri */}
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(k => (
          <KpiCard key={k.id} {...k} t={t} locale={locale} />
        ))}
      </section>

      {/* Grafikler — 6 kolonluk ızgara. Revenue Overview + Live Activity
          üst satır; Revenue Overview'ın altındaki boşluğa Revenue Split ve
          Günlük bahis hacmi. Live Activity iki satırı birden kaplar. */}
      <section className="mb-3.5 grid grid-cols-1 gap-3.5 xl:grid-cols-6">
        <div className="flex flex-col rounded-xl border border-white/10 bg-bg-card xl:col-span-4">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
            <div>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.revenue.title')}</h3>
              <p className="mt-0.5 text-xs text-text-3">{t('admin.dashboard.revenue.hint')}</p>
            </div>
            <div className="inline-flex gap-0.5 rounded-lg border border-white/10 bg-bg-deep p-0.5">
              {RANGE_OPTIONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`h-[26px] rounded-md px-2.5 text-[11.5px] font-extrabold transition ${
                    range === r ? 'bg-bg-hover text-text-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-text-3 hover:text-text-1'
                  }`}
                >
                  {t(`admin.dashboard.revenue.range${r}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 px-4 pt-3 sm:px-5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CASINO_COLOR }} />
              {t('admin.dashboard.revenue.legendCasino')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SPORTS_COLOR }} />
              {t('admin.dashboard.revenue.legendSports')}
            </span>
          </div>

          <div className="min-h-[200px] flex-1 px-2 pb-1">
            {!revenue ? (
              <div className="flex h-full items-center justify-center text-sm text-text-3">{t('common.loading')}</div>
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

          <div className="mt-2 flex flex-wrap gap-5 border-t border-white/10 px-4 py-3 sm:px-5">
            <div className="text-[11px] text-text-3">
              {t('admin.dashboard.revenue.totalCasino')}
              <b className="mt-0.5 block text-sm font-extrabold tabular-nums text-text-1">{formatCurrency(rangeTotals.casino)}</b>
            </div>
            <div className="text-[11px] text-text-3">
              {t('admin.dashboard.revenue.totalSports')}
              <b className="mt-0.5 block text-sm font-extrabold tabular-nums text-text-1">{formatCurrency(rangeTotals.sports)}</b>
            </div>
            <div className="text-[11px] text-text-3">
              {t('admin.dashboard.revenue.totalAll')}
              <b className="mt-0.5 block text-sm font-extrabold tabular-nums text-text-1">{formatCurrency(rangeTotals.total)}</b>
            </div>
          </div>
        </div>

        {/* Canlı akış (gerçek socket verisi) — iki satır boyunca sağda,
            Revenue Overview'ın altındaki kartların yanı boş kalmasın diye. */}
        <div className="xl:col-span-2 xl:row-span-2">
          <ActivityFeed />
        </div>

        {/* Donut */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-bg-card xl:col-span-2">
          <div className="px-4 pt-4 sm:px-5">
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.split.title')}</h3>
            <p className="mt-0.5 text-xs text-text-3">{t('admin.dashboard.split.hint', { days: range })}</p>
          </div>
          {!revenue ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-3">{t('common.loading')}</div>
          ) : rangeTotals.total <= 0 ? (
            <div className="flex flex-1 items-center justify-center px-5 pb-4 text-center text-xs text-text-3">
              {t('admin.dashboard.split.noPositiveData')}
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 pb-4 pt-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-center gap-5">
                <div className="relative h-[120px] w-[120px] shrink-0">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="46" fill="none" stroke="#162038" strokeWidth="14" />
                    <circle cx="60" cy="60" r="46" fill="none" stroke={SPORTS_COLOR} strokeWidth="14"
                      strokeDasharray={`${(100 - casinoPct) * 2.89} ${casinoPct * 2.89}`} strokeDashoffset="0" />
                    <circle cx="60" cy="60" r="46" fill="none" stroke={CASINO_COLOR} strokeWidth="14"
                      strokeDasharray={`${casinoPct * 2.89} ${(100 - casinoPct) * 2.89}`} strokeDashoffset={`${-(100 - casinoPct) * 2.89}`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold tracking-tight" style={{ color: CASINO_COLOR }}>{casinoPct}%</span>
                    <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-text-3">{t('admin.dashboard.revenue.legendCasino')}</span>
                  </div>
                </div>
                <div className="flex min-w-[160px] flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2 rounded-[9px] border border-white/5 bg-bg-hover px-3 py-2.5 text-xs">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CASINO_COLOR }} />
                    <span className="flex-1 font-semibold text-text-2">{t('admin.dashboard.revenue.legendCasino')}</span>
                    <span className="font-mono font-bold" style={{ color: CASINO_COLOR }}>{formatCurrency(rangeTotals.casino)}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-[9px] border border-white/5 bg-bg-hover px-3 py-2.5 text-xs">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SPORTS_COLOR }} />
                    <span className="flex-1 font-semibold text-text-2">{t('admin.dashboard.revenue.legendSports')}</span>
                    <span className="font-mono font-bold" style={{ color: SPORTS_COLOR }}>{formatCurrency(rangeTotals.sports)}</span>
                  </div>
                  <div className="flex items-center gap-2 px-1 pt-1 text-xs">
                    <span className="flex-1 text-text-3">{t('admin.dashboard.split.totalLabel', { days: range })}</span>
                    <span className="font-mono font-bold text-text-1">{formatCurrency(rangeTotals.total)}</span>
                  </div>
                </div>
              </div>
              <p className="border-t border-white/5 pt-2.5 text-xs text-text-3">
                {t('admin.dashboard.split.deltaNote', {
                  delta: new Intl.NumberFormat(locale, { signDisplay: 'always', maximumFractionDigits: 1 }).format(casinoShareDelta),
                })}
              </p>
            </div>
          )}
        </div>

        {/* Günlük bahis hacmi — /admin/analytics/sports (Analytics > Sports ile aynı uç) */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-bg-card xl:col-span-2">
          <div className="px-4 pt-4 sm:px-5">
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.betVolumeTitle', { days: range })}</h3>
            <p className="mt-0.5 text-xs text-text-3">{t('admin.analytics.betCount')}</p>
          </div>
          <div className="min-h-[120px] flex-1 px-1 pb-2 pt-2">
            {!betVolume?.length ? (
              <div className="flex h-full items-center justify-center text-sm text-text-3">{t('common.loading')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={betVolume} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="_id" tick={{ fill: '#4a5a78', fontSize: 9 }} interval={Math.max(0, Math.floor(range / 8) - 1)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#4a5a78', fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ background: '#111d30', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 11 }}
                    formatter={(value) => [new Intl.NumberFormat(locale).format(value), t('admin.analytics.betCount')]}
                    labelFormatter={(l) => String(l)}
                  />
                  <Bar dataKey="count" name={t('admin.analytics.betCount')} fill={SPORTS_COLOR} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Orta bento: kuyruklar | risk */}
      <section className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2 xl:grid-cols-12">
        {/* Kuyruklar */}
        <div className="rounded-xl border border-white/10 bg-bg-card xl:col-span-5">
          <div className="px-4 pt-4 sm:px-[18px]">
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.queues.title')}</h3>
            <p className="mt-0.5 text-xs text-text-3">{t('admin.dashboard.queues.hint')}</p>
          </div>
          <div className="flex flex-col gap-2 p-4 sm:p-[18px]">
            {queues.map(q => (
              <Link
                key={q.id}
                to={q.to}
                className="flex items-center gap-3 rounded-[10px] border border-white/5 bg-bg-hover p-3 text-left transition hover:border-primary/35 hover:bg-bg-card"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[9px] ${q.tone}`}>
                  <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">{QUEUE_ICONS[q.id]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-text-1">{q.label}</span>
                  <span className="block text-[11.5px] text-text-3">{q.sub}</span>
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-text-1">{q.count}</span>
                <span className="material-symbols-outlined !text-[18px] text-text-3" aria-hidden="true">chevron_right</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Yüksek riskli aktivite */}
        <div className="flex flex-col rounded-xl border border-white/10 bg-bg-card xl:col-span-7">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-[18px]">
            <div>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.risk.title')}</h3>
              <p className="mt-0.5 text-xs text-text-3">{t('admin.dashboard.risk.hint')}</p>
            </div>
            <Link to="/admin/compliance?tab=risk" className={`${ADMIN_BTN_GHOST} h-7 px-2 text-xs`}>
              {t('common.all')}
              <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">chevron_right</span>
            </Link>
          </div>
          <div className="mt-2.5 flex flex-col">
            {findings.length === 0 && (
              <div className="border-t border-white/5 px-4 py-6 text-center text-xs text-text-3 sm:px-[18px]">
                {t('admin.dashboard.risk.empty')}
              </div>
            )}
            {findings.map(f => {
              // F3 — bulgular /risk/findings'ten canlı gelir; oyuncu adı
              // populate edilmiş olarak döner, yoksa ham id gösterilir.
              const player = f.playerId?.username || f.playerId?.email || '—';
              return (
                <div key={f._id} className="flex items-start gap-3 border-t border-white/5 px-4 py-3 hover:bg-white/[0.02] sm:px-[18px]">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase tracking-wide ${sevClass[String(f.severity).toLowerCase()] || 'bg-gold/15 text-gold'}`}>
                    {t(`admin.dashboard.risk.sev${String(f.severity).charAt(0) + String(f.severity).slice(1).toLowerCase()}`)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold leading-snug text-text-1">
                      {f.description || f.code}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-text-3">{player} · {f.code}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="rounded-full bg-danger/20 px-2 py-[3px] text-[11px] font-extrabold text-danger">
                      {t('admin.dashboard.risk.badgeOpen')}
                    </span>
                    <span className="font-mono text-[11px] text-text-3">{relativeTime(f.createdAt, locale, t)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sağlık + bekleyen finans */}
      <section className="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2 xl:grid-cols-12">
        <div className="rounded-xl border border-white/10 bg-bg-card xl:col-span-5">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-[18px]">
            <div>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.health.title')}</h3>
              <p className="mt-0.5 text-xs text-text-3">{t('admin.dashboard.health.hint')}</p>
            </div>
            <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-extrabold uppercase text-success">
              {t('admin.dashboard.health.statusHealthy')}
            </span>
          </div>
          <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3.5 sm:px-[18px]">
            {healthMetrics(health, onlineCount, t).map(m => (
              <div key={m.id}>
                <div className="mb-1.5 flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-text-2">{t(m.labelKey)}</span>
                  <b className="font-mono font-bold text-text-1">{m.text}</b>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <i
                    className={`block h-full rounded-full ${
                      m.tone === 'warn' ? 'bg-warning' : m.tone === 'purple' ? 'bg-[#8b5cf6]' : 'bg-primary'
                    }`}
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
              </div>
            ))}
            {/* Not satırı: /admin/health/system `lastCheck` DÖNMÜYOR, o yüzden
                önceki koşul (`health?.lastCheck`) hep false dönüp burada sonsuza
                dek "Yükleniyor..." gösteriyordu. Gerçek veri `system.uptime`:
                process süresinden servisin başlama anı hesaplanır. */}
            <p className="border-t border-white/5 pt-2.5 text-xs text-text-3">
              {healthNote}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-bg-card xl:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-[18px]">
            <div>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.dashboard.pendingFinance.title')}</h3>
              <p className="mt-0.5 text-xs text-text-3">{t('admin.dashboard.pendingFinance.hint')}</p>
            </div>
            <div className="inline-flex gap-0.5 rounded-lg border border-white/10 bg-bg-deep p-0.5 text-[11.5px] font-extrabold">
              {[
                { key: 'all', label: t('common.all') },
                { key: 'vip', label: t('admin.risk.levelVip') },
                { key: 'high', label: t('admin.dashboard.pendingFinance.filterHigh') },
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFinFilter(f.key)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    finFilter === f.key
                      ? 'bg-bg-hover text-text-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                      : 'text-text-3 hover:text-text-1'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto p-4 sm:px-[18px] sm:pb-[18px]">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs font-bold text-text-3">
                  <th className="border-b border-white/10 bg-black/20 px-3 py-2.5">{t('admin.dashboard.pendingFinance.colPlayer')}</th>
                  <th className="border-b border-white/10 bg-black/20 px-3 py-2.5 text-right">{t('admin.activityFeed.amount')}</th>
                  <th className="border-b border-white/10 bg-black/20 px-3 py-2.5">{t('admin.dashboard.pendingFinance.colMethod')}</th>
                  <th className="border-b border-white/10 bg-black/20 px-3 py-2.5">{t('admin.dashboard.pendingFinance.colRisk')}</th>
                  <th className="border-b border-white/10 bg-black/20 px-3 py-2.5">{t('admin.users.status')}</th>
                  <th className="border-b border-white/10 bg-black/20 px-3 py-2.5">{t('admin.dashboard.pendingFinance.colAge')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleFinance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-text-3">{t('common.noData')}</td>
                  </tr>
                ) : visibleFinance.map(row => (
                  <tr key={row.ref} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-3">
                      <div className="font-bold text-text-1">{row.player}</div>
                      <div className="mt-0.5 font-mono text-xs text-text-3">{row.ref}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-text-1">{row.amount}</td>
                    <td className="px-3 py-3 text-text-2">
                      {t(`admin.dashboard.pendingFinance.kind.${PENDING_KIND_KEY[row.kind] || 'other'}`)}
                      {row.usdt != null && <div className="mt-0.5 font-mono text-xs text-text-3">{row.usdt} USDT</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${
                        row.risk === 'vip' ? 'bg-info/20 text-info'
                          : row.risk === 'high' ? 'bg-danger/20 text-danger'
                            : row.risk === 'medium' ? 'bg-warning/20 text-warning'
                              : 'bg-success/15 text-success'
                      }`}>
                        {row.risk === 'vip' ? t('admin.risk.levelVip')
                          : row.risk === 'high' ? t('admin.risk.levelHigh')
                            : row.risk === 'medium' ? t('admin.risk.levelMedium')
                              : t('admin.risk.levelLow')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-[3px] text-[11px] font-extrabold ${
                        row.status === 'approved' ? 'bg-success/15 text-success' : 'bg-warning/20 text-warning'
                      }`}>
                        {row.status === 'approved' ? t('admin.dashboard.pendingFinance.statusApproved') : t('admin.dashboard.pendingFinance.statusPending')}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-text-3">{row.age ? t(row.age.key, row.age.params) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Hızlı erişim */}
      <section className="rounded-xl border border-white/10 bg-bg-card">
        <div className="flex flex-wrap items-center gap-2 px-4 py-4 sm:px-[18px]">
          <span className="mr-1 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-text-3/80">{t('admin.dashboard.quick.label')}</span>
          <Link to="/admin/users" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">person_add</span>
            {t('admin.dashboard.quick.createUser')}
          </Link>
          <Link to="/admin/promotions" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">redeem</span>
            {t('admin.dashboard.quick.newCampaign')}
          </Link>
          <Link to="/admin/chat" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">campaign</span>
            {t('admin.dashboard.quick.sendAnnouncement')}
          </Link>
          <Link to="/admin/demo-data" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">science</span>
            {t('admin.dashboard.quick.loadDemoData')}
          </Link>
          <Link to="/admin/health" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">monitor_heart</span>
            {t('admin.nav.health')}
          </Link>
          <Link to="/admin/game-settings" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">tune</span>
            {t('admin.nav.gameSettings')}
          </Link>
          <Link to="/admin/analytics" className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-bg-hover px-3 text-xs font-bold text-text-1 transition hover:border-primary/45 hover:text-primary">
            <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">file_download</span>
            {t('admin.dashboard.quick.downloadReport')}
          </Link>
        </div>
      </section>

      <p className="mt-4 text-xs text-text-3/70">
        {t('admin.dashboard.footer.mockStats', {
          users: overview?.users?.total?.toLocaleString(locale) ?? '—',
          ggr: revenue ? formatCurrency(revenue.today.total) : '—',
          online: onlineCount.toLocaleString(locale),
        })}
      </p>
    </div>
  );
}
