import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useSearchParams } from 'react-router-dom';
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
  casino_return: '🎰 Casino Dönüş',
  bonus_conversion: '💰 Bonus Çevrimi',
  crypto_deposit: '🪙 Kripto Yatırım',
  crypto_withdraw: '🪙 Kripto Çekim',
};

const AMOUNT_PRESETS = [100, 250, 500, 1000, 2000, 5000];

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);

  const [mode, setMode]       = useState(searchParams.get('mode') || 'deposit');
  const [method, setMethod]   = useState(searchParams.get('method') || 'bank');
  const [step, setStep]       = useState('amount');
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount]     = useState('');
  const [bankInfo, setBankInfo]             = useState(null);
  const [submitting, setSubmitting]         = useState(false);
  const [successRequest, setSuccessRequest] = useState(null);
  const [wagerings, setWagerings]           = useState([]);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyPassword, setPrivacyPassword] = useState('');
  const [privacyError, setPrivacyError] = useState('');
  const [withdrawIban, setWithdrawIban]         = useState('');
  const [withdrawFullName, setWithdrawFullName] = useState('');

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const fetchTx = useCallback(() => {
    api.get('/users/me/transactions').then(r => setTransactions(r.data.transactions)).catch(() => {});
  }, []);

  const fetchWagerings = useCallback(() => {
    api.get('/promotions/my-wagerings').then(r => setWagerings(r.data.wagerings || [])).catch(() => setWagerings([]));
  }, []);

  useEffect(() => { fetchTx(); fetchWagerings(); }, [fetchTx, fetchWagerings]);

  useEffect(() => {
    if (method === 'bank') {
      api.get('/bank/info').then(r => setBankInfo(r.data)).catch(() => {});
    }
  }, [method]);

  const onBalanceUpdate = (newBalance) => {
    updateBalance(newBalance);
    fetchTx();
  };

  const syncParams = (m, meth) => {
    const params = {};
    if (m !== 'deposit') params.mode = m;
    if (meth !== 'bank') params.method = meth;
    setSearchParams(params, { replace: true });
  };

  const switchMode = (m) => {
    setMode(m);
    setStep('amount');
    setSelectedAmount(null);
    setCustomAmount('');
    setSuccessRequest(null);
    setWithdrawIban('');
    setWithdrawFullName('');
    syncParams(m, method);
  };

  const switchMethod = (m) => {
    setMethod(m);
    setStep('amount');
    setSelectedAmount(null);
    setCustomAmount('');
    setSuccessRequest(null);
    syncParams(mode, m);
  };

  const handleAmountSelect = (amount) => {
    setSelectedAmount(amount);
    setCustomAmount('');
    if (method === 'bank' && mode === 'deposit') {
      setStep('confirm');
    } else if (method === 'bank' && mode === 'withdraw') {
      setStep('confirm');
    }
  };

  const handleCustomChange = (e) => {
    const v = e.target.value;
    setCustomAmount(v);
    setSelectedAmount(null);
  };

const handleBankSubmit = async (confirmForfeit = false) => {
     const amount = selectedAmount || parseFloat(customAmount);
     if (!amount || amount <= 0) return;
     setSubmitting(true);
     try {
       const endpoint = mode === 'deposit' ? '/bank/deposit' : '/bank/withdraw';

       // Prepare data based on mode and method
       let requestData = { amount };
       if (method === 'bank') {
         if (mode === 'withdraw') {
           // Banka çekiminde alıcı IBAN + ad soyad zorunlu (bkz. withdrawSchema)
           requestData = {
             amount,
             iban: withdrawIban,
             fullName: withdrawFullName,
             confirmForfeit
           };
         } else {
           // Banka yatırımında alıcı bilgisi gerekmiyor (depositSchema sadece amount istiyor —
           // yatıran kişi zaten ekranda gösterilen platform IBAN'ına kendi hesabından gönderiyor)
           requestData = { amount };
         }
       }

       const { data } = await api.post(endpoint, requestData);
       setSuccessRequest({ amount, ...data });
       addToast(data.message, 'success');
     } catch (e) {
       const errorCode = e.response?.data?.error?.code;
       const errorMessage = e.response?.data?.error?.message
                          || e.response?.data?.error
                          || e.response?.data
                          || 'İşlem başarısız';
       if (errorCode === 'ACTIVE_BONUS_LOCK' && !confirmForfeit) {
         if (window.confirm(`${errorMessage}\n\nDevam etmek istiyor musunuz?`)) {
           // setSubmitting(false) burada ÇAĞRILMAZ: dışarıdaki finally, bu
           // await'in sonucu beklenmeden senkron olarak setSubmitting(false)
           // çalıştırırdı (return + finally JS semantiği), retry isteği hâlâ
           // devam ederken submit butonunu erken açıp çift-gönderime yol açar.
           // `await` ile bekleyip sonucu return etmek, dış finally'nin yalnızca
           // retry TAMAMEN bitince çalışmasını garanti eder.
           return await handleBankSubmit(true);
         }
       } else {
         addToast(errorMessage, 'error');
       }
     } finally { setSubmitting(false); }
   };

  const amount = selectedAmount || (customAmount ? parseFloat(customAmount) : 0);

  const onFiatSubmit = async (data) => {
    try {
      const endpoint = '/transactions/deposit';
      const { data: res } = await api.post(endpoint, { amount: parseFloat(data.amount) });
      onBalanceUpdate(res.newBalance);
      addToast(res.message, 'success');
      reset();
    } catch (e) { addToast(e.response?.data?.error?.message || 'İşlem başarısız', 'error'); }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6">
      {/* Kullanıcı bilgi kartı */}
      <div className="bg-bg-card border border-white/10 rounded-xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-2xl font-bold text-accent">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-xl font-bold text-text-1">{user?.username}</div>
            <div className="text-text-2 text-sm">{user?.email}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl sm:text-3xl font-black" style={{ color: '#00d4ff' }}>₺{(user?.balance ?? 0).toFixed(2)}</div>
            <div className="text-text-3 text-xs mt-1">Ana Bakiye</div>
            {user?.locked > 0 && (
              <div className="text-sm font-bold mt-1" style={{ color: '#fbbf24' }}>
                🔒 ₺{user.locked.toFixed(2)} kilitli (aktif bonus)
              </div>
            )}
            {user?.withdrawable != null && (
              <div className="text-[11px] mt-1" style={{ color: '#7c8aae' }}>
                Çekilebilir: ₺{user.withdrawable.toFixed(2)}
              </div>
            )}
            {user?.activePalaceBalance != null && (
              <div className="text-xs mt-1.5" style={{ color: '#7c8aae' }}>
                🏰 Casino'da ₺{user.activePalaceBalance.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* ── Aktif bonus wagering'leri ── */}
        {wagerings.filter(w => w.status === 'active').length > 0 && (
          <div className="mb-5 space-y-2">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#8899bb' }}>
              Aktif Bonus Wagering
            </div>
            {wagerings.filter(w => w.status === 'active').map(w => {
              const pct = w.wageringRequired > 0
                ? Math.min(100, Math.floor((w.wageringProgress / w.wageringRequired) * 100))
                : 100;
              const remaining = Math.max(0, w.wageringRequired - w.wageringProgress);
              const now = Date.now();
              const deadlineTs = w.deadline ? new Date(w.deadline).getTime() : null;
              const msLeft = deadlineTs ? deadlineTs - now : null;
              const daysLeft = msLeft !== null ? Math.floor(msLeft / 86400000) : null;
              const hoursLeft = msLeft !== null ? Math.floor((msLeft % 86400000) / 3600000) : null;
              const expired = msLeft !== null && msLeft <= 0;
              const urgent = !expired && daysLeft !== null && daysLeft < 3;
              const deadlineColor = expired ? '#ef4444' : urgent ? '#fbbf24' : '#8899bb';
              const deadlineText = expired
                ? '⛔ Süresi doldu'
                : daysLeft !== null && daysLeft >= 1
                  ? `⏰ ${daysLeft}g ${hoursLeft}s kaldı`
                  : hoursLeft !== null
                    ? `⏰ ${hoursLeft}s kaldı`
                    : null;
              return (
                <div
                  key={w._id}
                  className="rounded-xl p-3"
                  style={{
                    background: expired ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.04)',
                    border: expired ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    opacity: expired ? 0.65 : 1,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-text-1 truncate">{w.description || 'Bonus'}</div>
                      <div className="text-[10px] text-text-3 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>₺{w.bonusAmount} bonus · {w.multiplier}x çevrim</span>
                        {deadlineText && (
                          <span
                            className="font-bold"
                            style={{
                              color: deadlineColor,
                              padding: expired ? '1px 6px' : 0,
                              borderRadius: 4,
                              background: expired ? 'rgba(239,68,68,0.15)' : 'transparent',
                              border: expired ? '1px solid rgba(239,68,68,0.4)' : 'none',
                            }}
                          >
                            {deadlineText}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-sm font-black" style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        {pct}%
                      </div>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#ffffff08' }}>
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: expired
                          ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                          : 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-text-3 mt-1.5">
                    <span>₺{w.wageringProgress.toFixed(2)} / ₺{w.wageringRequired.toFixed(2)}</span>
                    <span>Kalan: ₺{remaining.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tamamlanmış bonuslar (cash'e çevrilebilir) ── */}
        {wagerings.filter(w => w.status === 'completed').length > 0 && (
          <div className="mb-5 space-y-2">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#8899bb' }}>
              Çevrime Hazır Bonuslar
            </div>
            {wagerings.filter(w => w.status === 'completed').map(w => (
              <div key={w._id} className="bg-bg-base/40 border border-[#00d4ff44] rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-text-1 truncate">{w.description || 'Bonus'}</div>
                  <div className="text-[10px] text-text-3 mt-0.5">
                    ₺{w.bonusAmount} bonus · Wagering tamamlandı ✓
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const { data } = await api.post(`/promotions/${w.promotionId || 'manual'}/wagerings/${w._id}/convert`);
                      addToast(data.message || 'Bonus cash\'e çevrildi', 'success');
                      updateBalance(data.newBalance);
                      fetchWagerings();
                      fetchTx();
                    } catch (e) {
                      addToast(e.response?.data?.error?.message || 'Çevrim başarısız', 'error');
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-black whitespace-nowrap"
                  style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', boxShadow: '0 0 12px #00d4ff55' }}
                >
                  💰 Çevir
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Arkadaşını Davet Et ── */}
        <div className="mb-5 bg-bg-base/40 border border-accent/20 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: '#8899bb' }}>
            🎁 Arkadaşını Davet Et
          </div>
          <p className="text-xs text-text-3 mb-3">
            Davet ettiğin arkadaşın platforma kazandırdığı kârın %10'u anında senin hesabına aktarılır.
          </p>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-3">Referans Linkin</span>
            <CopyButton text={`${window.location.origin}/login?ref=${user?.username}&tab=register`} />
          </div>
          <div className="bg-bg-base border border-white/10 rounded-lg px-3 py-2 font-mono text-xs text-text-1 break-all mb-3">
            {`${window.location.origin}/login?ref=${user?.username}&tab=register`}
          </div>
          <div className="text-sm text-text-1">
            Şimdiye kadar kazandığın: <span className="font-bold text-accent">₺{(user?.totalReferralEarnings ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* ── Para Yatır / Para Çek konteynırı ── */}
        <div className="bg-bg-base/60 border border-white/[0.06] rounded-2xl p-4 sm:p-5">
          {/* Üst: Para Yatır / Para Çek toggle */}
          <div className="flex bg-bg-deep/40 rounded-xl p-1 mb-4">
            {[
              { key: 'deposit', label: '📥 Para Yatır' },
              { key: 'withdraw', label: '📤 Para Çek' },
            ].map(m => (
              <button key={m.key} onClick={() => switchMode(m.key)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                  mode === m.key
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'text-text-3 hover:text-text-1'
                }`}>{m.label}</button>
            ))}
          </div>

          {/* Alt: Banka / Kripto seçici */}
          <div className="flex gap-2 mb-4">
            {[
              { key: 'bank', label: '🏦 Banka ile', desc: 'Havale / EFT' },
              { key: 'crypto', label: '🪙 Kripto ile', desc: 'USDT TRC20' },
            ].map(m => (
              <button key={m.key} onClick={() => switchMethod(m.key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl text-sm font-medium border transition ${
                  method === m.key
                    ? 'bg-accent/10 border-accent/40 text-accent'
                    : 'bg-bg-deep/30 border-white/[0.06] text-text-3 hover:text-text-2 hover:border-white/20'
                }`}>
                <span>{m.label}</span>
                <span className="text-[10px] opacity-60">{m.desc}</span>
              </button>
            ))}
          </div>

          {/* ── BANK DEPOSIT ── */}
          {method === 'bank' && mode === 'deposit' && !successRequest && step === 'amount' && (
            <div className="space-y-4">
              <p className="text-sm text-text-2 font-medium">Yatırılacak Tutarı Seçin</p>
              <div className="grid grid-cols-3 gap-2">
                {AMOUNT_PRESETS.map(a => (
                  <button key={a} onClick={() => handleAmountSelect(a)}
                    className={`py-3 rounded-xl text-base font-bold border transition ${
                      selectedAmount === a
                        ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
                        : 'bg-bg-deep/40 border-white/[0.06] text-text-2 hover:border-accent/30 hover:text-text-1'
                    }`}>₺{a}</button>
                ))}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                <div className="relative flex justify-center"><span className="bg-bg-base/60 px-2 text-xs text-text-3">veya</span></div>
              </div>
              <div className="flex gap-2">
                <input type="number" value={customAmount}
                  onChange={handleCustomChange}
                  placeholder="Özel tutar (min. 10₺)"
                  className="flex-1 bg-bg-deep/40 border border-white/10 rounded-xl px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
                <button onClick={() => {
                  const v = parseFloat(customAmount);
                  if (v >= 10) handleAmountSelect(v);
                  else addToast('Minimum 10₺', 'error');
                }} disabled={!customAmount || parseFloat(customAmount) < 10}
                  className="px-5 py-2.5 bg-accent text-white font-semibold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-40">
                  Devam
                </button>
              </div>
            </div>
          )}

          {method === 'bank' && mode === 'deposit' && !successRequest && step === 'confirm' && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center">
                <div className="text-3xl font-black text-primary mb-1">₺{amount.toFixed(2)}</div>
                <div className="text-xs text-text-3">Yatırma Talebi</div>
              </div>

              {bankInfo && (
                <div className="bg-bg-deep/40 border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-3">Banka</span>
                    <span className="text-sm text-text-1 font-medium">{bankInfo.bankName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-3">Şube</span>
                    <span className="text-sm text-text-1">{bankInfo.bankBranch}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-3">Alıcı</span>
                    <span className="text-sm text-text-1 font-medium">{bankInfo.accountHolder}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-3">IBAN</span>
                      {/* IBAN geçici olarak maskeli — '****' kopyalatmanın anlamı yok */}
                      {!String(bankInfo.iban).includes('*') && <CopyButton text={bankInfo.iban} />}
                    </div>
                    <div className="bg-bg-base border border-white/10 rounded-lg px-3 py-2 font-mono text-sm text-text-1 tracking-wide break-all">
                      {bankInfo.iban}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 text-xs text-text-2 leading-relaxed space-y-1">
                <p>1️⃣ Yukarıdaki hesaba <strong className="text-text-1">₺{amount.toFixed(2)}</strong> gönderin</p>
                <p>2️⃣ Ödemeyi <strong className="text-amber-400">yalnızca kendi adınıza kayıtlı banka hesabınızdan</strong> gönderin — hesap eşleştirmesi ancak bu şekilde yapılabilir</p>
                <p>3️⃣ Admin onayından sonra bakiye otomatik yüklenecektir</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep('amount')}
                  className="flex-1 py-2.5 border border-white/20 text-text-3 rounded-xl text-sm font-medium hover:bg-bg-hover transition">
                  Geri
                </button>
                <button onClick={() => handleBankSubmit()} disabled={submitting}
                  className="flex-1 py-2.5 bg-accent text-white font-semibold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50">
                  {submitting ? 'Gönderiliyor...' : '✅ Havale Bildirimi Yap'}
                </button>
              </div>
            </div>
          )}

          {method === 'bank' && mode === 'deposit' && successRequest && (
            <div className="text-center py-4 space-y-3 animate-fade-in">
              <div className="text-4xl">✅</div>
              <div className="text-lg font-bold text-text-1">Talep Oluşturuldu</div>
              <div className="text-3xl font-black text-primary">₺{successRequest.amount.toFixed(2)}</div>
              <p className="text-sm text-text-3 max-w-xs mx-auto">
                Hesaba havale yaptıktan sonra admin onayını bekleyin. Onaylandığında bakiyenize yansıyacaktır.
              </p>
              <button onClick={() => { setStep('amount'); setSelectedAmount(null); setSuccessRequest(null); }}
                className="px-5 py-2 border border-accent/40 text-accent rounded-xl text-sm font-medium hover:bg-accent/10 transition">
                Yeni Talep
              </button>
            </div>
          )}

          {/* ── BANK WITHDRAW ── */}
          {method === 'bank' && mode === 'withdraw' && !successRequest && (
            <div className="space-y-4">
              {step === 'amount' && (
                <>
                  <p className="text-sm text-text-2 font-medium">Çekilecek Tutarı Seçin</p>
                  <div className="grid grid-cols-3 gap-2">
                    {AMOUNT_PRESETS.map(a => (
                      <button key={a} onClick={() => handleAmountSelect(a)}
                        className={`py-3 rounded-xl text-base font-bold border transition ${
                          selectedAmount === a
                            ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20'
                            : 'bg-bg-deep/40 border-white/[0.06] text-text-2 hover:border-accent/30 hover:text-text-1'
                        }`}>₺{a}</button>
                    ))}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                    <div className="relative flex justify-center"><span className="bg-bg-base/60 px-2 text-xs text-text-3">veya</span></div>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" value={customAmount}
                      onChange={handleCustomChange}
                      placeholder="Özel tutar (min. 20₺)"
                      className="flex-1 bg-bg-deep/40 border border-white/10 rounded-xl px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
                    <button onClick={() => {
                      const v = parseFloat(customAmount);
                      if (v >= 20) { handleAmountSelect(v); }
                      else addToast('Minimum 20₺', 'error');
                    }} disabled={!customAmount || parseFloat(customAmount) < 20}
                      className="px-5 py-2.5 bg-accent text-white font-semibold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-40">
                      Devam
                    </button>
                  </div>

                  {selectedAmount && selectedAmount > (user?.balance || 0) && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg p-2.5 text-danger text-xs text-center">
                      Yetersiz bakiye. Mevcut bakiyeniz: ₺{user?.balance?.toFixed(2)}
                    </div>
                  )}
                </>
              )}

              {step === 'confirm' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="text-center">
                    <div className="text-3xl font-black text-danger mb-1">₺{amount.toFixed(2)}</div>
                    <div className="text-xs text-text-3">Çekim Talebi</div>
                  </div>

                  <div className="bg-bg-deep/40 border border-white/[0.06] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-3">Mevcut Bakiye</span>
                      <span className="text-sm text-text-1 font-medium">₺{user?.balance?.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-3">Çekim Tutarı</span>
                      <span className="text-sm text-text-1 font-medium text-danger">₺{amount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                      <span className="text-xs text-text-3">Kalan Bakiye</span>
                      <span className="text-base font-bold text-text-1">₺{((user?.balance || 0) - amount).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-text-3 mb-1 block">Alıcı IBAN (TR ile başlamalı)</label>
                      <input type="text" value={withdrawIban}
                        onChange={e => setWithdrawIban(e.target.value.toUpperCase())}
                        placeholder="TR__ ____ ____ ____ ____ ____ __"
                        className="w-full bg-bg-deep/40 border border-white/10 rounded-xl px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
                    </div>
                    <div>
                      <label className="text-xs text-text-3 mb-1 block">Hesap Sahibinin Adı Soyadı</label>
                      <input type="text" value={withdrawFullName}
                        onChange={e => setWithdrawFullName(e.target.value)}
                        placeholder="Ad Soyad"
                        className="w-full bg-bg-deep/40 border border-white/10 rounded-xl px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
                    </div>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-text-2 leading-relaxed">
                    Çekim talebiniz admin onayına gönderilecektir. Onaylandığında tutar banka hesabınıza aktarılır. İşlem 1-2 iş günü sürebilir.
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setStep('amount')}
                      className="flex-1 py-2.5 border border-white/20 text-text-3 rounded-xl text-sm font-medium hover:bg-bg-hover transition">
                      Geri
                    </button>
                    <button onClick={() => handleBankSubmit()}
                      disabled={submitting || amount > (user?.balance || 0) || withdrawIban.trim().length < 26 || withdrawFullName.trim().length < 3}
                      className="flex-1 py-2.5 bg-accent text-white font-semibold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50">
                      {submitting ? 'Gönderiliyor...' : '✅ Çekim Talebi Oluştur'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {method === 'bank' && mode === 'withdraw' && successRequest && (
            <div className="text-center py-4 space-y-3 animate-fade-in">
              <div className="text-4xl">✅</div>
              <div className="text-lg font-bold text-text-1">Çekim Talebi Alındı</div>
              <div className="text-3xl font-black text-danger">₺{successRequest.amount.toFixed(2)}</div>
              <p className="text-sm text-text-3 max-w-xs mx-auto">
                Talebiniz admin tarafından incelenecek ve onaylandığında hesabınıza aktarılacaktır.
              </p>
              <button onClick={() => { setStep('amount'); setSelectedAmount(null); setSuccessRequest(null); onBalanceUpdate(user?.balance); }}
                className="px-5 py-2 border border-accent/40 text-accent rounded-xl text-sm font-medium hover:bg-accent/10 transition">
                Yeni Talep
              </button>
            </div>
          )}

          {/* ── CRYPTO DEPOSIT ── */}
          {method === 'crypto' && mode === 'deposit' && <CryptoDeposit onBalanceUpdate={onBalanceUpdate} />}

          {/* ── CRYPTO WITHDRAW ── */}
          {method === 'crypto' && mode === 'withdraw' && <CryptoWithdraw onBalanceUpdate={onBalanceUpdate} />}
        </div>
      </div>

      {/* İşlem geçmişi */}
      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-text-1 mb-3">İşlem Geçmişi</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {transactions.map(tx => (
            <div key={tx._id} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
              <div>
                <span className="text-text-2">{TX_LABEL[tx.type] || tx.type}</span>
                {tx.note && <div className="text-text-3 text-xs truncate max-w-[100px] sm:max-w-[200px]">{tx.note}</div>}
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

       {/* KVKK Privacy & Account Section (Phase A6 / D5) */}
       <div className="mb-5 mt-8">
         <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: '#8899bb' }}>
           Verilerim & KVKK
         </div>
         <div className="bg-bg-base/40 border border-white/[0.06] rounded-xl p-4 space-y-2">
           <button
             onClick={() => setShowPrivacyModal(true)}
             className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 transition"
           >
             📥 Verilerimi indir (KVKK md.11)
           </button>
           <Link
             to="/legal/kvkk"
             className="block w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/10 text-text-1 hover:border-white/20 transition text-center"
           >
             📜 KVKK Aydınlatma Metni
           </Link>
           <Link
             to="/legal/responsible-gaming"
             className="block w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/10 text-text-1 hover:border-white/20 transition text-center"
           >
             🎲 Sorumlu Oyun & Limitler
           </Link>
         </div>
       </div>

       {/* Privacy Export Modal (Phase A6 / D5) */}
       {showPrivacyModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
           <div className="max-w-md w-full rounded-2xl p-6" style={{ background: '#0c1220', border: '1px solid rgba(0,212,255,0.3)' }}>
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-bold text-text-1">📥 Verilerimi İndir</h3>
               <button onClick={() => { setShowPrivacyModal(false); setPrivacyPassword(''); setPrivacyError(''); }} className="text-text-3 text-xl">×</button>
             </div>
             <p className="text-sm mb-4" style={{ color: '#8899bb' }}>
               KVKK md.11 kapsamında tüm verilerinizi JSON formatında indirebilirsiniz.
               Bahis, casino, bonus, para yatırma/çekme geçmişi dahil.
             </p>
             <input
               type="password"
               value={privacyPassword}
               onChange={e => setPrivacyPassword(e.target.value)}
               placeholder="Şifrenizi girin"
               className="w-full bg-bg-base border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 mb-3 focus:outline-none focus:border-cyan-400/50"
             />
             {privacyError && <p className="text-xs text-red-400 mb-3">{privacyError}</p>}
             <div className="flex gap-2">
               <button
                 onClick={() => { setShowPrivacyModal(false); setPrivacyPassword(''); setPrivacyError(''); }}
                 className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-white/10"
               >
                 İptal
               </button>
               <button
                 onClick={async () => {
                   if (!privacyPassword) { setPrivacyError('Şifre gerekli'); return; }
                   try {
                     const res = await api.post('/users/me/data-export', { password: privacyPassword }, { responseType: 'blob' });
                     const url = URL.createObjectURL(new Blob([res.data]));
                     const a = document.createElement('a');
                     a.href = url;
                     a.download = `data-export-${user?.username}-${Date.now()}.json`;
                     a.click();
                     addToast('Verileriniz indirildi', 'success');
                     setShowPrivacyModal(false);
                     setPrivacyPassword('');
                   } catch (e) {
                     setPrivacyError(e.response?.data?.error?.message || 'İndirme başarısız');
                   }
                 }}
                 className="flex-1 py-2.5 rounded-lg text-sm font-bold text-black"
                 style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)' }}
               >
                 İndir
               </button>
             </div>
           </div>
         </div>
       )}
     </div>
   );
}
