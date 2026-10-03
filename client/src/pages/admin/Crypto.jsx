import { useState, useEffect, useCallback, Fragment } from 'react';
import { useToastStore } from '../../store/toastStore';
import api from '../../services/api';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { useTranslation } from '../../i18n';
import { formatMoney, getActiveCurrency } from '../../utils/money.js';
import WalletStatCards from './components/WalletStatCards.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell, AdminExpandRow, AdminPager } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

const STATUS_TABS = [
  { key: 'all', labelKey: 'admin.crypto.tabAll' },
  { key: 'completed', labelKey: 'admin.crypto.tabCompleted' },
  { key: 'pending', labelKey: 'admin.crypto.tabPending' },
  { key: 'rejected', labelKey: 'admin.crypto.tabRejected' },
];

const TYPE_TABS = [
  { key: 'deposit', icon: 'arrow_downward', labelKey: 'admin.crypto.tabDeposits' },
  { key: 'withdraw', icon: 'arrow_upward', labelKey: 'admin.crypto.tabWithdrawals' },
];

function WalletBadge({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-3">{label}:</span>
      <span className={`text-xs font-semibold ${color}`}>{formatMoney(value)}</span>
    </div>
  );
}

function TxDetail({ tx, onAction, saving }) {
  const { t } = useTranslation();
  const currency = getActiveCurrency().code;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [blockchain, setBlockchain] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/crypto/tx-detail/${tx._id}`)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [tx._id]);

  // Blockchain doğrulama — sadece pending yatırımlar için
  const verifyBlockchain = useCallback(async (txHash) => {
    if (!txHash) return;
    setVerifying(true);
    try {
      const res = await api.get(`/admin/crypto/tx-verify/${txHash}`);
      setBlockchain(res.data);
    } catch {
      setBlockchain({ confirmed: false, found: false, verifyFailed: true });
    } finally {
      setVerifying(false);
    }
  }, []);

  if (loading) return <div className="text-xs text-text-3 py-2">{t('admin.crypto.balanceLoading')}</div>;
  if (!detail) return <div className="text-xs text-danger py-2">{t('admin.crypto.balanceLoadFailed')}</div>;

  const { user: u } = detail;
  const isWithdrawal = tx.type === 'crypto_withdraw';
  const isPending = tx.status === 'pending';
  const tryAmt = Math.abs(tx.amount);
  // Çekimin USDT karşılığı (metadata; eski kayıtlarda yok → fiat tutara düşer)
  const usdtNeeded = Number(tx.metadata?.usdtAmount) || tryAmt;

  // Risk değerlendirmesi
  let risk = null;
  if (isPending) {
    if (isWithdrawal) {
      if (u.withdrawable >= tryAmt) {
        risk = { level: 'low', text: t('admin.crypto.riskOk', { withdrawable: u.withdrawable, amount: tryAmt, currency }) };
      } else {
        risk = { level: 'high', text: t('admin.crypto.riskLow', { withdrawable: u.withdrawable, amount: tryAmt, currency }) };
      }
    } else {
      risk = { level: 'info', text: t('admin.crypto.riskDepositPending', { amount: tryAmt, currency }) };
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/8 space-y-2">
      {/* Kullanıcı Bakiye Özeti */}
      <div className="bg-black/20 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.crypto.balanceSummary')}</div>
        <div className="flex flex-wrap gap-3">
          <WalletBadge label={t('admin.crypto.balanceTotal')} value={u.balance} color="text-text-1" />
          <WalletBadge label={t('admin.crypto.balanceBonusLocked')} value={u.bonusLocked} color="text-warning" />
          <WalletBadge label={t('admin.crypto.balanceWithdrawable')} value={u.withdrawable} color={u.withdrawable > 0 ? 'text-success' : 'text-danger'} />
        </div>
        {u.activeWagerings?.length > 0 && (
          <div className="mt-1.5 text-[10px] text-text-3">
            {t('admin.crypto.activeBonus', {
              list: u.activeWagerings.map(w =>
                t('admin.crypto.bonusProgress', {
                  amount: w.bonusAmount,
                  currency,
                  pct: Math.round(w.wageringProgress / w.wageringRequired * 100),
                })
              ).join(', '),
            })}
          </div>
        )}
      </div>

      {/* Risk Değerlendirmesi */}
      {risk && (
        <div className={`text-xs px-2 py-1 rounded ${
          risk.level === 'low' ? 'bg-success/15 text-success' :
          risk.level === 'high' ? 'bg-danger/15 text-danger' :
          'bg-info/15 text-info'
        }`}>
          {risk.level === 'low' && <span className="material-symbols-outlined !text-[14px] align-middle" aria-hidden="true">check_circle</span>}
          {risk.level === 'high' && <span className="material-symbols-outlined !text-[14px] align-middle" aria-hidden="true">warning</span>}
          {risk.level === 'info' && <span className="material-symbols-outlined !text-[14px] align-middle" aria-hidden="true">info</span>}
          {risk.text}
        </div>
      )}

      {/* Hot Wallet Bakiye Kontrolü (çekim pending ise) */}
      {isWithdrawal && isPending && detail.hotWallet && (
        <div className={`text-[10px] px-2 py-1 rounded ${
          detail.hotWallet.usdt >= usdtNeeded ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
        }`}>
          {detail.hotWallet.usdt >= usdtNeeded
            ? t('admin.crypto.hotWalletOk', { balance: detail.hotWallet.usdt, needed: usdtNeeded })
            : t('admin.crypto.hotWalletLow', { balance: detail.hotWallet.usdt, needed: usdtNeeded })}
        </div>
      )}

      {/* Çekim detayı (metadata: adres, USDT, txHash) */}
      {isWithdrawal && tx.metadata?.toAddress && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-3">
          <span>{t('admin.crypto.address')} <span className="font-mono text-text-2">{tx.metadata.toAddress}</span></span>
          {tx.metadata.usdtAmount != null && (
            <span className="font-mono text-text-2">{Number(tx.metadata.usdtAmount).toFixed(2)} USDT</span>
          )}
          {tx.metadata.txHash && (
            <span>{t('admin.crypto.tx')} <span className="font-mono text-text-2">{tx.metadata.txHash.slice(0, 20)}…</span></span>
          )}
        </div>
      )}

      {/* cryptoDeposit detayı (yatırma ise) */}
      {detail.cryptoDeposit && tx.type === 'crypto_deposit' && (
        <div className="text-[10px] text-text-3 space-y-1.5">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{t('admin.crypto.tx')} <span className="text-text-2 font-mono">{detail.cryptoDeposit.txHash?.slice(0, 20)}…</span></span>
            <span>{t('admin.crypto.status')} <span className="text-text-2">{detail.cryptoDeposit.status}</span></span>
            {detail.cryptoDeposit.toAddress && (
              <span>{t('admin.crypto.address')} <span className="text-text-2 font-mono">{detail.cryptoDeposit.toAddress?.slice(0, 16)}…</span></span>
            )}
          </div>

          {/* Yatırma Adresi Bakiyesi — blockchain'den canlı sorgu */}
          {isPending && detail.depositWallet && (
            <div className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${
              detail.depositWallet.usdt >= tryAmt
                ? 'bg-success/15 border border-success/20'
                : detail.depositWallet.usdt > 0
                  ? 'bg-warning/15 border border-warning/20'
                  : 'bg-danger/15 border border-danger/20'
            }`}>
              <div>
                <span className="text-text-3">{t('admin.crypto.walletBalance')} </span>
                <span className={`font-bold ${
                  detail.depositWallet.usdt >= tryAmt ? 'text-success' :
                  detail.depositWallet.usdt > 0 ? 'text-warning' : 'text-danger'
                }`}>{detail.depositWallet.usdt?.toFixed(2)} USDT</span>
              </div>
              <div>
                <span className="text-text-3">TRX: </span>
                <span className="text-text-2">{detail.depositWallet.trx?.toFixed(2)}</span>
              </div>
              {detail.depositWallet.usdt >= tryAmt ? (
                <span className="text-success font-semibold">{t('admin.crypto.sufficient')}</span>
              ) : detail.depositWallet.usdt > 0 ? (
                <span className="text-warning">{t('admin.crypto.partial', { current: detail.depositWallet.usdt?.toFixed(2), needed: tryAmt, currency })}</span>
              ) : (
                <span className="text-danger">{t('admin.crypto.empty')}</span>
              )}
            </div>
          )}

          {/* Blockchain Doğrulama */}
          {tx.status !== 'completed' && detail.cryptoDeposit.txHash && !detail.cryptoDeposit.txHash.startsWith('seed_') && (
            <div className="flex items-center gap-2">
              {blockchain === null && !verifying && (
                <button
                  onClick={() => verifyBlockchain(detail.cryptoDeposit.txHash)}
                  className="text-[10px] px-2 py-1 rounded bg-info/15 border border-info/30 text-info hover:bg-info/20 transition"
                >
                  {t('admin.crypto.verifyBlockchain')}
                </button>
              )}
              {verifying && (
                <span className="text-[10px] text-info animate-pulse">{t('admin.crypto.verifying')}</span>
              )}
              {blockchain && !verifying && (
                <div className={`text-[10px] px-2 py-1 rounded ${
                  blockchain.confirmed ? 'bg-success/15 text-success' :
                  blockchain.found ? 'bg-warning/15 text-warning' :
                  'bg-danger/15 text-danger'
                }`}>
                  {blockchain.verifyFailed && t('admin.crypto.verifyFailed')}
                  {!blockchain.verifyFailed && blockchain.confirmed && t('admin.crypto.confirmed', { block: blockchain.blockNumber })}
                  {!blockchain.verifyFailed && blockchain.found && !blockchain.confirmed && t('admin.crypto.pendingConfirm', { status: blockchain.contractRet })}
                  {!blockchain.verifyFailed && !blockchain.found && t('admin.crypto.notFound', { error: blockchain.error ? ': ' + blockchain.error : '' })}
                </div>
              )}
            </div>
          )}
          {tx.status !== 'completed' && detail.cryptoDeposit.txHash?.startsWith('seed_') && (
            <div className="text-[10px] text-warning/60">{t('admin.crypto.seedWarning')}</div>
          )}
        </div>
      )}

      {/* Onay/Red Butonları */}
      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onAction(tx, 'approve')}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-success/15 border border-success/30 text-success hover:bg-success/20 transition disabled:opacity-50 inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">check</span>
            {t('admin.crypto.approve')}
          </button>
          <input
            type="text"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder={t('admin.crypto.reject')}
            className="flex-1 text-xs bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-text-1 placeholder:text-text-3/50"
          />
          <button
            onClick={() => onAction(tx, 'reject', rejectReason)}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-danger/20 border border-danger/30 text-danger hover:bg-danger/20 transition disabled:opacity-50 inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">close</span>
            {t('admin.crypto.reject')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminCrypto() {
  const fmt = useFormatters();
  const { t, locale } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const currencyCode = getActiveCurrency().code;
  const [type, setType] = useState('deposit');
  const [status, setStatus] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [hotWallet, setHotWallet] = useState(null);
  const [walletNotConfigured, setWalletNotConfigured] = useState(false);
  const [stats, setStats] = useState(null);
  const [pendingCounts, setPendingCounts] = useState({ deposit: 0, withdraw: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = type === 'deposit' ? '/admin/crypto/all-deposits' : '/admin/crypto/all-withdrawals';
      const params = { page, limit: 30 };
      if (status !== 'all') params.status = status;
      const [txRes, hwRes, pendDep, pendWd, statsRes] = await Promise.all([
        api.get(endpoint, { params }),
        api.get('/crypto/hot-wallet-balance').catch(e => ({
          data: null,
          notConfigured: e.response?.data?.error?.code === 'CRYPTO_WALLET_NOT_CONFIGURED',
        })),
        api.get('/admin/crypto/all-deposits', { params: { status: 'pending', limit: 1 } }).catch(() => ({ data: { total: 0 } })),
        api.get('/admin/crypto/all-withdrawals', { params: { status: 'pending', limit: 1 } }).catch(() => ({ data: { total: 0 } })),
        api.get('/admin/crypto/stats').catch(() => ({ data: null })),
      ]);
      setTransactions(txRes.data.transactions);
      setTotal(txRes.data.total);
      setHotWallet(hwRes.data);
      setWalletNotConfigured(Boolean(hwRes.notConfigured));
      setPendingCounts({ deposit: pendDep.data.total, withdraw: pendWd.data.total });
      const st = statsRes.data;
      setStats(st && { deposits: st.deposits.total, payouts: st.payouts.total, net: st.net, count: st.count });
    } catch {
      addToast(t('admin.crypto.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [type, status, page, addToast, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, status]);

  async function handleAction(tx, action) {
    setSaving(true);
    try {
      if (tx.type === 'crypto_deposit') {
        if (action === 'approve') {
          await api.post(`/admin/crypto/deposits/${tx._id}/approve`);
          addToast(t('admin.crypto.depositApproved'), 'success');
        } else {
          await api.post(`/admin/crypto/deposits/${tx._id}/reject`);
          addToast(t('admin.crypto.depositRejected'), 'info');
        }
      } else {
        if (action === 'approve') {
          await api.post(`/admin/crypto/withdrawals/${tx._id}/approve`);
          addToast(t('admin.crypto.withdrawApproved'), 'success');
        } else {
          await api.post(`/admin/crypto/withdrawals/${tx._id}/reject`);
          addToast(t('admin.crypto.withdrawRejected'), 'info');
        }
      }
      setExpanded(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.crypto.actionFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / 30);

  const statusColor = (s) => {
    if (s === 'completed') return { tone: 'bg-success/15 text-success', dot: 'bg-success' };
    if (s === 'pending') return { tone: 'bg-warning/15 text-warning', dot: 'bg-warning' };
    if (s === 'rejected') return { tone: 'bg-danger/15 text-danger', dot: 'bg-danger' };
    return { tone: 'bg-white/10 text-text-2', dot: 'bg-white/40' };
  };

  const statusLabel = (s) => {
    if (s === 'completed') return t('admin.crypto.statusCompleted');
    if (s === 'pending') return t('admin.crypto.statusPending');
    if (s === 'rejected') return t('admin.crypto.statusRejected');
    return s;
  };

  return (
    <>
      <WalletStatCards stats={stats} />

      {/* Hot Wallet */}
      {walletNotConfigured && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/15 p-3.5 text-xs text-warning">
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">warning</span>
          <span>{t('admin.cryptoPayment.walletNotConfigured')}</span>
        </div>
      )}
      {hotWallet && (
        <div className="mb-4 rounded-xl border border-white/10 bg-bg-card p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">Hot Wallet</div>
          <div className="mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight text-success">
            {hotWallet.usdt?.toFixed(2) || 0} USDT
          </div>
          <div className="mt-1.5 truncate font-mono text-xs text-text-3">{hotWallet.address}</div>
          {hotWallet.activated === false && (
            <div className="mt-1.5 text-xs text-warning">{t('admin.cryptoPayment.walletNotActivated')}</div>
          )}
        </div>
      )}

      {/* Type Tabs */}
      <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit max-w-full overflow-x-auto mb-3">
        {TYPE_TABS.map(tab => {
          const pendingCount = pendingCounts[tab.key] || 0;
          return (
            <button key={tab.key} onClick={() => setType(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${type === tab.key ? 'bg-accent text-white' : 'text-text-3 hover:text-text-1'}`}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{tab.icon}</span>
              {t(tab.labelKey)}
              {pendingCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${type === tab.key ? 'bg-white/20 text-white' : 'bg-warning/15 text-warning'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
           );
        })}
      </div>

      {/* Status Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button key={tab.key} onClick={() => setStatus(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${status === tab.key ? 'bg-white/10 text-text-1' : 'text-text-3 hover:text-text-1'}`}>
              {t(tab.labelKey)}
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

      {/* Transactions */}
      <AdminTable
        loading={loading}
        empty={transactions.length === 0}
        emptyLabel={t('admin.crypto.txListEmpty')}
        columns={[
          { key: 'user', label: t('admin.crypto.columnUser') },
          { key: 'type', label: t('admin.crypto.columnType') },
          { key: 'amount', label: t('admin.crypto.columnAmount'), align: 'right' },
          { key: 'status', label: t('admin.crypto.columnStatus') },
          { key: 'date', label: t('admin.crypto.columnDate') },
          { key: 'actions', label: t('admin.crypto.columnActions'), align: 'right' },
        ]}
      >
        {transactions.map(tx => {
          const name = tx.userId?.username || '???';
          const initials = name.slice(0, 2).toUpperCase();
          const st = statusColor(tx.status);
          const isPending = tx.status === 'pending';
          const open = expanded === tx._id;
          return (
            <Fragment key={tx._id}>
              <AdminTableRow
                className={isPending ? 'cursor-pointer' : ''}
                onClick={() => isPending && setExpanded(open ? null : tx._id)}
              >
                <AdminTableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-text-1">{name}</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-text-3">{tx.userId?.email || '—'}</div>
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="text-xs font-semibold text-text-2">
                    {tx.type === 'crypto_deposit' ? t('admin.crypto.deposit') : t('admin.crypto.withdraw')}
                  </span>
                </AdminTableCell>
                <AdminTableCell align="right">
                  <span className={`font-mono text-sm font-semibold tabular-nums ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount?.toFixed(2)} {currencyCode}
                  </span>
                  {tx.note && <div className="mt-0.5 truncate text-xs text-text-3">{tx.note}</div>}
                </AdminTableCell>
                <AdminTableCell>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${st.tone}`}>
                    <i className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {statusLabel(tx.status)}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="whitespace-nowrap font-mono text-xs text-text-3">{fmt.formatDateTime(tx.createdAt)}</span>
                </AdminTableCell>
                <AdminTableActionsCell>
                  <RowActions
                    label={t('admin.crypto.columnActions')}
                    items={isPending ? [
                      { key: 'approve', label: t('admin.crypto.approve'), icon: 'check', tone: 'success', disabled: saving, onClick: () => handleAction(tx, 'approve') },
                      { key: 'reject', label: t('admin.crypto.reject'), icon: 'close', tone: 'danger', disabled: saving, onClick: () => handleAction(tx, 'reject') },
                      { key: 'detail', label: t('admin.crypto.detail'), icon: open ? 'expand_less' : 'expand_more', onClick: () => setExpanded(open ? null : tx._id) },
                    ] : []}
                  />
                </AdminTableActionsCell>
              </AdminTableRow>
              <AdminExpandRow colSpan={6} open={open && isPending}>
                <TxDetail tx={tx} onAction={handleAction} saving={saving} />
              </AdminExpandRow>
            </Fragment>
          );
        })}
      </AdminTable>

      <AdminPager
        page={page}
        pages={totalPages}
        onPage={setPage}
        totalLabel={t('admin.crypto.countLine', { count: total.toLocaleString(locale), page, pages: totalPages })}
      />
    </>
  );
}
