import { useState, useEffect, useCallback, Fragment } from 'react';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import WalletStatCards from './components/WalletStatCards.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell, AdminExpandRow, ExpandToggle, AdminPager } from '../../components/admin/AdminTable.jsx';

const STATUS_TABS = [
  { key: 'all', label: 'all' },
  { key: 'succeeded', label: 'slikair.succeeded' },
  { key: 'pending', label: 'slikair.pending' },
  { key: 'failed', label: 'slikair.failed' },
];

export default function SlikairPayments() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [stats, setStats] = useState(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (status !== 'all') params.status = status;
      const { data } = await api.get('/admin/slikair/payments', { params });
      setPayments(data.payments);
      setTotal(data.total);
      setPages(data.pages);
    } catch { /* */ }
    setLoading(false);
  }, [page, status]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/slikair/stats');
      setStats(data);
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const statusColor = (s) => {
    if (s === 'succeeded') return 'text-success';
    if (s === 'failed') return 'text-danger';
    if (s === 'pending' || s === 'processing') return 'text-warning';
    return 'text-text-3';
  };

  // Harita dışı (beklenmeyen) bir status/method değeri gelirse ham değeri
  // OLDUĞU GİBİ göster — t() namespace'siz key ile çağrılırsa assertValidKey
  // hard throw eder ve TÜM sayfayı çökertir (2026-09-23'te "card" değeriyle
  // canlıda gerçekleşti). 'BLIK' gibi marka adları zaten çeviri key'i değil,
  // noktasız oldukları için t()'e hiç verilmiyor.
  const statusLabel = (s) => {
    const map = { created: 'slikair.created', pending: 'slikair.pending', processing: 'slikair.processing', succeeded: 'slikair.succeeded', failed: 'slikair.failed', refunded: 'slikair.refunded' };
    const key = map[s];
    return key ? t(key) : s;
  };

  const methodLabel = (m) => {
    const map = { credit_card: 'slikair.creditCard', open_banking: 'slikair.openBanking', crypto: 'slikair.crypto', blik: 'BLIK', googlepay: 'slikair.googlePay', applepay: 'slikair.applePay' };
    const mapped = map[m];
    if (!mapped) return m;
    return mapped.includes('.') ? t(mapped) : mapped;
  };

  // ── Admin: payout (çekim) başlat ── kullanıcı tarafında henüz bir
  // talep-onay akışı yok, bu yüzden minimal — payload'ı ham JSON olarak
  // gönderiyor (18 ödeme yönteminin her biri için ayrı form gereksiz).
  const [payoutForm, setPayoutForm] = useState({
    userId: '',
    amount: '',
    currency: 'EUR',
    method: 'crypto',
    country: 'NLD',
    paymentDetails: '{\n  "method": "crypto",\n  "convertTo": "USDT",\n  "toAddress": ""\n}',
  });
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutResult, setPayoutResult] = useState(null);

  const submitPayout = async (e) => {
    e.preventDefault();
    setPayoutBusy(true);
    setPayoutResult(null);
    try {
      let paymentDetails;
      try {
        paymentDetails = JSON.parse(payoutForm.paymentDetails);
      } catch {
        setPayoutResult({ error: t('admin.slikair.jsonInvalid') });
        setPayoutBusy(false);
        return;
      }
      const { data } = await api.post('/admin/slikair/payouts', {
        userId: payoutForm.userId,
        amount: Number(payoutForm.amount),
        currency: payoutForm.currency,
        method: payoutForm.method,
        country: payoutForm.country,
        paymentDetails,
      });
      setPayoutResult({ success: data });
      fetchStats();
    } catch (err) {
      setPayoutResult({ error: err?.response?.data?.error?.message || err?.response?.data?.error || err.message });
    }
    setPayoutBusy(false);
  };

  return (
    <>
      {/* Payout (çekim) başlat — minimal, kullanıcı tarafında henüz bir
          talep-onay akışı yok. Sandbox payout desteklemiyor (Slikair'in
          kendi dokümanı), bu yüzden burada gerçek bir başarı beklemeyin. */}
      <details className="bg-bg-card border border-white/10 rounded-xl p-4 mb-6">
        <summary className="cursor-pointer text-sm font-semibold text-text-1 flex items-center gap-1.5">
          <span className="material-symbols-outlined !text-[16px] text-primary" aria-hidden="true">science</span>
          {t('admin.slikair.payoutSection')}
        </summary>
        <form onSubmit={submitPayout} className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          <input required placeholder={t('admin.slikair.userPlaceholder')} value={payoutForm.userId}
            onChange={e => setPayoutForm(f => ({ ...f, userId: e.target.value }))}
            className="bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 col-span-2 md:col-span-1" />
          <input required type="number" min="1" step="0.01" placeholder={t('admin.slikair.amountPlaceholder')} value={payoutForm.amount}
            onChange={e => setPayoutForm(f => ({ ...f, amount: e.target.value }))}
            className="bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1" />
          <input required placeholder={t('admin.slikair.currencyPlaceholder')} value={payoutForm.currency}
            onChange={e => setPayoutForm(f => ({ ...f, currency: e.target.value }))}
            className="bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1" />
          <input required placeholder={t('admin.slikair.methodPlaceholder')} value={payoutForm.method}
            onChange={e => setPayoutForm(f => ({ ...f, method: e.target.value }))}
            className="bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1" />
          <input required placeholder={t('admin.slikair.countryPlaceholder')} value={payoutForm.country}
            onChange={e => setPayoutForm(f => ({ ...f, country: e.target.value }))}
            className="bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1" />
          <textarea required rows={4} placeholder="paymentDetails (JSON)" value={payoutForm.paymentDetails}
            onChange={e => setPayoutForm(f => ({ ...f, paymentDetails: e.target.value }))}
            className="bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-xs text-text-1 font-mono col-span-2 md:col-span-3" />
          <button type="submit" disabled={payoutBusy}
            className="col-span-2 md:col-span-3 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50">
            {payoutBusy ? t('common.sending') : t('admin.slikair.payoutStart')}
          </button>
        </form>
        {payoutResult?.success && (
          <pre className="mt-3 text-xs text-success bg-bg-deep rounded-lg p-3 overflow-auto">{JSON.stringify(payoutResult.success, null, 2)}</pre>
        )}
        {payoutResult?.error && (
          <div className="mt-3 text-xs text-danger bg-bg-deep rounded-lg p-3">{JSON.stringify(payoutResult.error)}</div>
        )}
      </details>

      {/* İstatistikler */}
      <WalletStatCards
        stats={stats && { deposits: stats.deposits.total, payouts: stats.payouts.total, net: stats.net, count: total }}
      />

      {/* Durum sekmeleri */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button key={tab.key} onClick={() => { setStatus(tab.key); setPage(1); }}
              className={`px-4 py-2 rounded-md text-sm font-bold transition ${
                status === tab.key ? 'bg-accent text-white' : 'text-text-3 hover:text-text-1'
              }`}>
              {tab.key === 'all' ? t('common.all') : t(tab.label)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setStatus('all'); setPage(1); }}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      {/* İşlem listesi */}
      <AdminTable
        loading={loading}
        empty={payments.length === 0}
        emptyLabel={t('admin.slikair.empty')}
        columns={[
          { key: 'user', label: t('admin.slikair.columnUser') },
          { key: 'method', label: t('admin.slikair.columnMethod') },
          { key: 'amount', label: t('admin.slikair.columnAmount'), align: 'right' },
          { key: 'status', label: t('admin.slikair.columnStatus') },
          { key: 'date', label: t('admin.slikair.columnDate') },
          { key: 'actions', label: t('common.actions') },
        ]}
      >
        {payments.map(p => {
          const name = p.userId?.username || '???';
          const initials = name.slice(0, 2).toUpperCase();
          const open = selectedPayment?._id === p._id;
          return (
            <Fragment key={p._id}>
              <AdminTableRow
                className="cursor-pointer"
                onClick={() => setSelectedPayment(open ? null : p)}
              >
                <AdminTableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-text-1">{name}</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-text-3">{p.email || '—'}</div>
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-text-2">
                    {methodLabel(p.paymentMethod)}
                  </span>
                </AdminTableCell>
                <AdminTableCell align="right">
                  <span className="font-mono text-sm font-semibold tabular-nums text-primary">{formatMoney(p.amount)}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <span className={`text-[11px] font-extrabold uppercase ${statusColor(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="whitespace-nowrap font-mono text-xs text-text-3">{fmt.formatDateTime(p.createdAt)}</span>
                </AdminTableCell>
                <AdminTableActionsCell>
                  <ExpandToggle
                    open={open}
                    onToggle={() => setSelectedPayment(open ? null : p)}
                    label={t('admin.slikair.detailStatus')}
                  />
                </AdminTableActionsCell>
              </AdminTableRow>
              <AdminExpandRow colSpan={6} open={open}>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-text-3">Payin ID:</span> <span className="font-mono text-text-1">{p.payinId || '—'}</span></div>
                  <div><span className="text-text-3">Request ID:</span> <span className="font-mono text-[10px] text-text-1">{p.requestId}</span></div>
                  <div><span className="text-text-3">{t('admin.slikair.detailCurrency')}</span> <span className="text-text-1">{p.currency}</span></div>
                  <div><span className="text-text-3">{t('admin.slikair.detailCountry')}</span> <span className="text-text-1">{p.country}</span></div>
                  <div><span className="text-text-3">Email:</span> <span className="text-text-1">{p.email}</span></div>
                  <div><span className="text-text-3">{t('admin.slikair.detailStatus')}</span> <span className="text-text-1">{p.statusCode || '—'}</span></div>
                  {p.reasonCode && <div><span className="text-text-3">{t('admin.slikair.detailReason')}</span> <span className="text-text-1">{p.reasonCode}</span></div>}
                  {p.declineReason && <div><span className="text-text-3">{t('admin.slikair.detailDecline')}</span> <span className="text-text-1">{p.declineReason}</span></div>}
                  {p.creditedAt && <div><span className="text-text-3">{t('admin.slikair.detailCredit')}</span> <span className="text-text-1">{fmt.formatDateTime(p.creditedAt)}</span></div>}
                </div>
              </AdminExpandRow>
            </Fragment>
          );
        })}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.slikair.countLine', { count: total.toLocaleString(locale), page, pages })}
      />
    </>
  );
}
