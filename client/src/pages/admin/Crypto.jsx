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

  async function approveDeposit(depositId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/deposits/${depositId}/approve`);
      addToast('Yatırma onaylandı.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Onay başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rejectDeposit(depositId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/deposits/${depositId}/reject`);
      addToast('Yatırma reddedildi.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Red başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approveWithdrawal(withdrawalId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/withdrawals/${withdrawalId}/approve`);
      addToast('Çekim onaylandı — hot wallet\'tan transfer başlatıldı.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Onay başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rejectWithdrawal(withdrawalId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/withdrawals/${withdrawalId}/reject`);
      addToast('Çekim reddedildi — bakiye iade edildi.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Red başarısız.', 'error');
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-text-1 text-sm">{tx.userId?.username || '???'}</span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-text-3">{tx.userId?.email}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(tx.status)}`}>
                      {statusLabel(tx.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-black ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount?.toFixed(2)} TRY
                    </span>
                    {tx.type === 'crypto_deposit' && (
                      <span className="text-xs text-text-3">Yatırma</span>
                    )}
                    {tx.type === 'crypto_withdraw' && (
                      <span className="text-xs text-text-3">Çekim</span>
                    )}
                  </div>
                  <div className="text-xs text-text-3 mt-1 truncate max-w-md">{tx.note}</div>
                  <div className="text-[10px] text-text-3/60 mt-0.5">{fmt.formatDateTime(tx.createdAt)}</div>
                </div>

                {/* Action Buttons */}
                {tx.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    {tx.type === 'crypto_deposit' && (
                      <>
                        <button onClick={() => approveDeposit(tx._id)} disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition disabled:opacity-50">
                          Onayla
                        </button>
                        <button onClick={() => rejectDeposit(tx._id)} disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50">
                          Reddet
                        </button>
                      </>
                    )}
                    {tx.type === 'crypto_withdraw' && (
                      <>
                        <button onClick={() => approveWithdrawal(tx._id)} disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition disabled:opacity-50">
                          Onayla
                        </button>
                        <button onClick={() => rejectWithdrawal(tx._id)} disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50">
                          Reddet
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
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
