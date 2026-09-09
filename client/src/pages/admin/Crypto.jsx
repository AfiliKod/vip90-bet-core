import { useState, useEffect, useCallback } from 'react';
import { useToastStore } from '../../store/toastStore';
import api from '../../services/api';
import { useFormatters } from '../../i18n/useFormatters.jsx';

const STATUS_TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'completed', label: 'Tamamlanan' },
  { key: 'pending', label: 'Bekleyen' },
  { key: 'rejected', label: 'Reddedilen' },
];

const TYPE_TABS = [
  { key: 'deposit', label: '📥 Yatırmalar' },
  { key: 'withdraw', label: '📤 Çekimler' },
];

function WalletBadge({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-3">{label}:</span>
      <span className={`text-xs font-semibold ${color}`}>{value}₺</span>
    </div>
  );
}

function TxDetail({ tx, onAction, saving }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/crypto/tx-detail/${tx._id}`)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [tx._id]);

  if (loading) return <div className="text-xs text-text-3 py-2">Bakiye bilgisi yükleniyor…</div>;
  if (!detail) return <div className="text-xs text-red-400 py-2">Bakiye bilgisi alınamadı</div>;

  const { user: u } = detail;
  const isWithdrawal = tx.type === 'crypto_withdraw';
  const isPending = tx.status === 'pending';
  const tryAmt = Math.abs(tx.amount);

  // Risk değerlendirmesi
  let risk = null;
  if (isPending) {
    if (isWithdrawal) {
      if (u.withdrawable >= tryAmt) {
        risk = { level: 'low', text: `Çekilebilir bakiye yeterli (${u.withdrawable}₺ ≥ ${tryAmt}₺)` };
      } else {
        risk = { level: 'high', text: `Çekilebilir bakiye yetersiz (${u.withdrawable}₺ < ${tryAmt}₺)` };
      }
    } else {
      risk = { level: 'info', text: `Yatırma onayı — bakiyeye eklenecek: +${tryAmt}₺` };
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/8 space-y-2">
      {/* Kullanıcı Bakiye Özeti */}
      <div className="bg-black/20 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">Kullanıcı Bakiye Özeti</div>
        <div className="flex flex-wrap gap-3">
          <WalletBadge label="Toplam" value={u.balance} color="text-text-1" />
          <WalletBadge label="Bonus Kilit" value={u.bonusLocked} color="text-yellow-400" />
          <WalletBadge label="Çekilebilir" value={u.withdrawable} color={u.withdrawable > 0 ? 'text-green-400' : 'text-red-400'} />
        </div>
        {u.activeWagerings?.length > 0 && (
          <div className="mt-1.5 text-[10px] text-text-3">
            Aktif bonus: {u.activeWagerings.map(w =>
              `${w.bonusAmount}₺ (${Math.round(w.wageringProgress / w.wageringRequired * 100)}% tamamlandı)`
            ).join(', ')}
          </div>
        )}
      </div>

      {/* Risk Değerlendirmesi */}
      {risk && (
        <div className={`text-xs px-2 py-1 rounded ${
          risk.level === 'low' ? 'bg-green-500/10 text-green-300' :
          risk.level === 'high' ? 'bg-red-500/10 text-red-300' :
          'bg-blue-500/10 text-blue-300'
        }`}>
          {risk.level === 'low' && '✅ '}
          {risk.level === 'high' && '⚠️ '}
          {risk.level === 'info' && 'ℹ️ '}
          {risk.text}
        </div>
      )}

      {/* cryptoDeposit detayı (yatırma ise) */}
      {detail.cryptoDeposit && tx.type === 'crypto_deposit' && (
        <div className="text-[10px] text-text-3">
          Tx Hash: <span className="text-text-2 font-mono">{detail.cryptoDeposit.txHash?.slice(0, 20)}…</span>
          {' | '}Durum: <span className="text-text-2">{detail.cryptoDeposit.status}</span>
        </div>
      )}

      {/* Onay/Red Butonları */}
      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onAction(tx, 'approve')}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition disabled:opacity-50"
          >
            ✅ Onayla
          </button>
          <input
            type="text"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Red sebebi (isteğe bağlı)"
            className="flex-1 text-xs bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-text-1 placeholder:text-text-3/50"
          />
          <button
            onClick={() => onAction(tx, 'reject', rejectReason)}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
          >
            ❌ Reddet
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminCrypto() {
  const fmt = useFormatters();
  const addToast = useToastStore(s => s.add);
  const [type, setType] = useState('deposit');
  const [status, setStatus] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [hotWallet, setHotWallet] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = type === 'deposit' ? '/admin/crypto/all-deposits' : '/admin/crypto/all-withdrawals';
      const params = { page, limit: 30 };
      if (status !== 'all') params.status = status;
      const [txRes, hwRes] = await Promise.all([
        api.get(endpoint, { params }),
        api.get('/crypto/hot-wallet-balance').catch(() => ({ data: null })),
      ]);
      setTransactions(txRes.data.transactions);
      setTotal(txRes.data.total);
      setHotWallet(hwRes.data);
    } catch {
      addToast('Crypto işlemleri yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [type, status, page, addToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, status]);

  async function handleAction(tx, action, reason) {
    setSaving(true);
    try {
      if (tx.type === 'crypto_deposit') {
        if (action === 'approve') {
          await api.post(`/admin/crypto/deposits/${tx._id}/approve`);
          addToast('Yatırma onaylandı — bakiyeye eklendi.', 'success');
        } else {
          await api.post(`/admin/crypto/deposits/${tx._id}/reject`);
          addToast('Yatırma reddedildi.', 'info');
        }
      } else {
        if (action === 'approve') {
          await api.post(`/admin/crypto/withdrawals/${tx._id}/approve`);
          addToast('Çekim onaylandı — hot wallet\'tan transfer başlatıldı.', 'success');
        } else {
          await api.post(`/admin/crypto/withdrawals/${tx._id}/reject`);
          addToast('Çekim reddedildi — bakiye iade edildi.', 'info');
        }
      }
      setExpanded(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'İşlem başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / 30);

  const statusColor = (s) => {
    if (s === 'completed') return 'text-green-400 bg-green-500/10';
    if (s === 'pending') return 'text-yellow-400 bg-yellow-500/10';
    if (s === 'rejected') return 'text-red-400 bg-red-500/10';
    return 'text-text-3 bg-white/5';
  };

  const statusLabel = (s) => {
    if (s === 'completed') return 'Tamamlandı';
    if (s === 'pending') return 'Bekliyor';
    if (s === 'rejected') return 'Reddedildi';
    return s;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-text-1 mb-4">💰 Crypto İşlemleri</h1>

      {/* Hot Wallet */}
      {hotWallet && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-4">
          <div>
            <div className="text-xs font-semibold text-green-300">Hot Wallet</div>
            <div className="text-lg font-bold text-green-200">{hotWallet.usdt?.toFixed(2) || 0} USDT</div>
          </div>
          <div className="text-xs text-green-300/80 truncate">{hotWallet.address}</div>
        </div>
      )}

      {/* Type Tabs */}
      <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit mb-3">
        {TYPE_TABS.map(tab => (
          <button key={tab.key} onClick={() => setType(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${type === tab.key ? 'bg-accent text-white' : 'text-text-3 hover:text-text-1'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit mb-4">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => setStatus(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${status === tab.key ? 'bg-white/10 text-text-1' : 'text-text-3 hover:text-text-1'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transactions */}
      {loading ? (
        <div className="text-center text-text-3 py-8 text-sm">Yükleniyor…</div>
      ) : transactions.length === 0 ? (
        <div className="text-center text-text-3 py-8 text-sm">Bu kategoride işlem bulunamadı.</div>
      ) : (
        <div className="space-y-2">
          {transactions.map(tx => (
            <div key={tx._id} className="bg-bg-card border border-white/10 rounded-xl p-4">
              {/* Ana Satır */}
              <div
                className="flex items-center justify-between gap-3 cursor-pointer"
                onClick={() => setExpanded(expanded === tx._id ? null : tx._id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-text-1 text-sm">{tx.userId?.username || '???'}</span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-text-3">{tx.userId?.email}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(tx.status)}`}>
                      {statusLabel(tx.status)}
                    </span>
                    {tx.status === 'pending' && (
                      <span className="text-[10px] text-text-3">▸ detay</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-black ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount?.toFixed(2)} TRY
                    </span>
                    <span className="text-xs text-text-3">
                      {tx.type === 'crypto_deposit' ? 'Yatırma' : 'Çekim'}
                    </span>
                  </div>
                  <div className="text-xs text-text-3 mt-1 truncate max-w-md">{tx.note}</div>
                  <div className="text-[10px] text-text-3/60 mt-0.5">{fmt.formatDateTime(tx.createdAt)}</div>
                </div>

                {/* Hızlı aksiyon (sadece pending) */}
                {tx.status === 'pending' && expanded !== tx._id && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); handleAction(tx, 'approve'); }} disabled={saving}
                      className="text-[10px] px-2 py-1 rounded bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition disabled:opacity-50">
                      Onayla
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleAction(tx, 'reject'); }} disabled={saving}
                      className="text-[10px] px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50">
                      Reddet
                    </button>
                  </div>
                )}
              </div>

              {/* Genişletilmiş Detay */}
              {expanded === tx._id && tx.status === 'pending' && (
                <TxDetail tx={tx} onAction={handleAction} saving={saving} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-text-2 hover:bg-white/10 transition disabled:opacity-30">
            Önceki
          </button>
          <span className="text-xs text-text-3">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-text-2 hover:bg-white/10 transition disabled:opacity-30">
            Sonraki
          </button>
        </div>
      )}
    </div>
  );
}
