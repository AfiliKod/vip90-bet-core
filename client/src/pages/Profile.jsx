import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';

const TX_LABEL = {
  deposit: '📥 Para Yatır',
  withdraw: '📤 Para Çek',
  bet: '🎯 Bahis',
  win: '🏆 Kazanç',
  bonus: '🎁 Bonus',
  refund: '↩️ İade',
  crypto_deposit: '🪙 Kripto Yatırım',
  crypto_withdraw: '🪙 Kripto Çekim',
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy}
      className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-text-2 transition shrink-0">
      {copied ? '✓ Kopyalandı' : 'Kopyala'}
    </button>
  );
}

function CryptoDeposit({ onBalanceUpdate }) {
  const [address, setAddress]   = useState(null);
  const [checking, setChecking] = useState(false);
  const addToast = useToastStore(s => s.add);

  useEffect(() => {
    api.get('/crypto/deposit-address')
      .then(r => setAddress(r.data.address))
      .catch(() => {});
  }, []);

  const checkDeposit = async () => {
    setChecking(true);
    try {
      const { data } = await api.post('/crypto/check-deposit');
      if (data.credited?.length > 0) {
        const total = data.credited.reduce((s, c) => s + c.usdtAmount, 0);
        addToast(`${total.toFixed(2)} USDT yatırım onaylandı!`, 'success');
        onBalanceUpdate(data.newBalance);
      } else {
        addToast('Henüz onaylanan yatırım yok', 'info');
      }
    } catch { addToast('Kontrol başarısız', 'error'); }
    finally { setChecking(false); }
  };

  if (!address) return (
    <div className="flex items-center justify-center py-12 text-text-3 text-sm">Yükleniyor...</div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-300 text-xs leading-relaxed">
        Yalnızca <strong>USDT (TRC20 / Tron ağı)</strong> gönderin. Diğer ağlar veya tokenler kalıcı olarak kaybolur.
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="p-3 bg-white rounded-xl">
          <QRCodeSVG value={address} size={160} level="M" />
        </div>
        <div className="w-full">
          <div className="text-xs text-text-3 mb-1">TRC20 Adresiniz</div>
          <div className="flex items-center gap-2 bg-bg-base border border-white/10 rounded-lg px-3 py-2">
            <span className="text-text-2 text-xs font-mono break-all flex-1">{address}</span>
            <CopyButton text={address} />
          </div>
        </div>
      </div>

      <button onClick={checkDeposit} disabled={checking}
        className="w-full py-2.5 border border-primary/40 text-primary rounded-lg text-sm font-medium hover:bg-primary/10 transition disabled:opacity-50">
        {checking ? 'Kontrol ediliyor...' : '🔄 Yatırımımı Kontrol Et'}
      </button>

      <p className="text-text-3 text-xs text-center">
        Gönderim sonrası "Kontrol Et" butonuna basın · Min 1 USDT · Tron ağı ~1 dk
      </p>
    </div>
  );
}

function CryptoWithdraw({ onBalanceUpdate }) {
  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm();
  const addToast = useToastStore(s => s.add);

  const onSubmit = async (data) => {
    try {
      const { data: res } = await api.post('/crypto/withdraw-request', {
        address: data.address.trim(),
        usdtAmount: parseFloat(data.usdtAmount),
      });
      onBalanceUpdate(res.newBalance);
      addToast(res.message, 'success');
      reset();
    } catch (e) { addToast(e.response?.data?.error || 'İşlem başarısız', 'error'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-300 text-xs">
        Çekim 24 saat içinde manuel olarak işlenir. Yalnızca TRC20 adresi girin.
      </div>
      <div>
        <label className="text-xs text-text-3 mb-1 block">TRC20 Cüzdan Adresiniz</label>
        <input {...register('address', { required: true, pattern: /^T[A-Za-z0-9]{33}$/ })}
          placeholder="T..."
          className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 text-sm font-mono focus:outline-none focus:border-primary" />
        {errors.address && <p className="text-danger text-xs mt-1">Geçerli bir TRC20 adresi girin</p>}
      </div>
      <div>
        <label className="text-xs text-text-3 mb-1 block">Miktar (USDT)</label>
        <input {...register('usdtAmount', { required: true, min: 5, valueAsNumber: true })}
          type="number" step="0.01" placeholder="Min. 5 USDT"
          className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 focus:outline-none focus:border-primary" />
        {errors.usdtAmount && <p className="text-danger text-xs mt-1">Min. 5 USDT</p>}
      </div>
      <button type="submit" disabled={isSubmitting}
        className="w-full py-2.5 bg-primary text-bg-deep font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50">
        {isSubmitting ? 'Gönderiliyor...' : 'Çekim Talebi Oluştur'}
      </button>
    </form>
  );
}

export default function Profile() {
  const { user, updateBalance } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab]       = useState('deposit');
  const [cryptoSub, setCryptoSub]       = useState('deposit'); // deposit | withdraw
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const fetchTx = useCallback(() => {
    api.get('/users/me/transactions').then(r => setTransactions(r.data.transactions)).catch(() => {});
  }, []);

  useEffect(() => { fetchTx(); }, [fetchTx]);

  const onBalanceUpdate = (newBalance) => {
    updateBalance(newBalance);
    fetchTx();
  };

  const onFiatSubmit = async (data) => {
    try {
      const endpoint = activeTab === 'deposit' ? '/transactions/deposit' : '/transactions/withdraw';
      const { data: res } = await api.post(endpoint, { amount: parseFloat(data.amount) });
      onBalanceUpdate(res.newBalance);
      addToast(res.message, 'success');
      reset();
    } catch (e) { addToast(e.response?.data?.error?.message || 'İşlem başarısız', 'error'); }
  };

  const TABS = [
    ['deposit',  '📥 Para Yatır'],
    ['withdraw', '📤 Para Çek'],
    ['crypto',   '🪙 Kripto'],
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Profil başlık */}
      <div className="bg-bg-card border border-white/10 rounded-xl p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-2xl font-bold text-accent">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-xl font-bold text-text-1">{user?.username}</div>
            <div className="text-text-2 text-sm">{user?.email}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-black text-primary">₺{user?.balance?.toFixed(2)}</div>
            <div className="text-text-3 text-xs mt-1">Ana Bakiye</div>
          </div>
        </div>

        {/* Sekme butonları */}
        <div className="flex gap-2 mb-4">
          {TABS.map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === v ? 'bg-accent text-white' : 'text-text-2 hover:bg-bg-hover border border-white/10'
              }`}>{l}</button>
          ))}
        </div>

        {/* Fiat yatır/çek */}
        {(activeTab === 'deposit' || activeTab === 'withdraw') && (
          <form onSubmit={handleSubmit(onFiatSubmit)} className="flex gap-2">
            <input
              {...register('amount', { required: true, min: activeTab === 'deposit' ? 10 : 20 })}
              type="number"
              placeholder={activeTab === 'deposit' ? 'Min. 10₺' : 'Min. 20₺'}
              className="flex-1 bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 focus:outline-none focus:border-primary"
            />
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2.5 bg-primary text-bg-deep font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50">
              {activeTab === 'deposit' ? 'Yatır' : 'Çek'}
            </button>
          </form>
        )}

        {/* Kripto sekmesi */}
        {activeTab === 'crypto' && (
          <div>
            <div className="flex gap-2 mb-4">
              {[['deposit', 'Yatırım'], ['withdraw', 'Çekim']].map(([v, l]) => (
                <button key={v} onClick={() => setCryptoSub(v)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                    cryptoSub === v ? 'bg-white/15 text-text-1' : 'text-text-3 hover:text-text-2'
                  }`}>{l}</button>
              ))}
            </div>
            {cryptoSub === 'deposit'
              ? <CryptoDeposit onBalanceUpdate={onBalanceUpdate} />
              : <CryptoWithdraw onBalanceUpdate={onBalanceUpdate} />
            }
          </div>
        )}
      </div>

      {/* İşlem geçmişi */}
      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-text-1 mb-3">İşlem Geçmişi</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {transactions.map(tx => (
            <div key={tx._id} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
              <div>
                <span className="text-text-2">{TX_LABEL[tx.type] || tx.type}</span>
                {tx.note && <div className="text-text-3 text-xs truncate max-w-[200px]">{tx.note}</div>}
                <div className="text-text-3 text-xs">{new Date(tx.createdAt).toLocaleDateString('tr-TR')}</div>
              </div>
              <div className="text-right">
                <span className={`font-medium ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                  {tx.amount > 0 ? '+' : ''}₺{Math.abs(tx.amount).toFixed(2)}
                </span>
                {tx.status === 'pending' && (
                  <div className="text-yellow-400 text-xs">Bekliyor</div>
                )}
              </div>
            </div>
          ))}
          {!transactions.length && (
            <div className="text-text-3 text-center py-4 text-sm">İşlem bulunamadı</div>
          )}
        </div>
      </div>
    </div>
  );
}
