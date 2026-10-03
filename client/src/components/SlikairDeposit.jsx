import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { useTranslation } from '../i18n';
import { formatMoney } from '../utils/money.js';

const PAYMENT_METHODS = [
  { key: 'credit_card', group: 'creditCard', requiresCard: true },
  { key: 'credit_card_ftd', group: 'creditCard', requiresCard: true },
  { key: 'googlepay', group: 'wallet' },
  { key: 'applepay', group: 'wallet' },
  { key: 'revolut', group: 'wallet' },
  { key: 'skrill', group: 'wallet' },
  { key: 'neteller', group: 'wallet' },
  { key: 'paysafecard', group: 'wallet' },
  { key: 'mbway', group: 'wallet' },
  { key: 'blik', group: 'wallet' },
  { key: 'open_banking', group: 'bank' },
  { key: 'ideal', group: 'bank' },
  { key: 'trustly', group: 'bank' },
  { key: 'eps', group: 'bank' },
  { key: 'instantbanking', group: 'bank' },
  { key: 'rapidtransfer', group: 'bank' },
  { key: 'mybank', group: 'bank' },
  { key: 'interac', group: 'bank' },
  { key: 'crypto', group: 'crypto' },
];

const METHOD_LABELS = {
  credit_card: '💳 {slikair.creditCard}',
  credit_card_ftd: '💳 {slikair.creditCardFtd}',
  googlepay: ' Google Pay',
  applepay: ' Apple Pay',
  revolut: ' Revolut',
  skrill: ' Skrill',
  neteller: ' NETELLER',
  paysafecard: ' paysafecard',
  mbway: ' MB WAY',
  blik: ' BLIK',
  open_banking: '🏦 {slikair.openBanking}',
  ideal: ' iDEAL',
  trustly: ' Trustly',
  eps: ' EPS',
  instantbanking: '⚡ {slikair.instantBanking}',
  rapidtransfer: ' {slikair.rapidTransfer}',
  mybank: ' MyBank',
  interac: ' Interac',
  crypto: '₿ Bitcoin',
};

const GROUP_KEYS = {
  creditCard: 'slikair.groupCreditCard',
  wallet: 'slikair.groupWallet',
  bank: 'slikair.groupBank',
  crypto: 'slikair.groupCrypto',
};

function getMethodLabel(t, key) {
  const template = METHOD_LABELS[key] || key;
  return template.replace(/\{([^}]+)\}/g, (_, k) => t(k));
}

export default function SlikairDeposit({ onBalanceUpdate }) {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const user = useAuthStore(s => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusCheck, setStatusCheck] = useState(null);
  const [cardData, setCardData] = useState({
    cardNum: '', cardHolder: '', cardExpireMonth: '', cardExpireYear: '', cardCvv: '',
  });

  useEffect(() => {
    const depositStatus = searchParams.get('deposit');
    const payinId = searchParams.get('payin_id');

    if (depositStatus === 'success' && payinId) {
      setStatusCheck({ payinId, status: 'checking' });
      checkPaymentStatus(payinId);
    } else if (depositStatus === 'pending' && payinId) {
      setStatusCheck({ payinId, status: 'pending' });
      checkPaymentStatus(payinId);
    } else if (depositStatus === 'failed') {
      setStatusCheck({ payinId: null, status: 'failed' });
    }

    if (depositStatus) {
      searchParams.delete('deposit');
      searchParams.delete('payin_id');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const checkPaymentStatus = async (payinId) => {
    try {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const { data } = await api.get('/slikair/my-payments', { params: { limit: 1 } });
        const payment = data.payments?.find(p => p.payinId === payinId);
        if (payment?.status === 'succeeded') {
          setStatusCheck({ payinId, status: 'succeeded' });
          addToast(t('slikair.depositSuccess'), 'success');
          onBalanceUpdate?.();
          return;
        }
        if (payment?.status === 'failed') {
          setStatusCheck({ payinId, status: 'failed' });
          addToast(t('slikair.depositFailed'), 'error');
          return;
        }
      }
      setStatusCheck({ payinId, status: 'processing' });
      addToast(t('slikair.depositProcessing'), 'info');
    } catch {
      setStatusCheck({ payinId, status: 'unknown' });
    }
  };

  const handleCardChange = (field, value) => {
    setCardData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) {
      addToast(t('slikair.minimumAmount'), 'error');
      return;
    }

    setSubmitting(true);
    try {
      const methodConfig = PAYMENT_METHODS.find(m => m.key === paymentMethod);
      const payload = {
        amount: amt,
        currency: 'EUR',
        paymentMethod,
        email: user?.email || '',
        country: 'NLD',
        firstName: user?.username || 'User',
        lastName: user?.username || 'Player',
        phone: user?.phone || undefined,
        birthDate: user?.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : undefined,
      };

      if (methodConfig?.requiresCard) {
        Object.assign(payload, cardData);
      }

      const { data } = await api.post('/slikair/deposit', payload);

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        addToast(t('slikair.depositInitFailed'), 'error');
      }
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.response?.data?.error || t('slikair.depositInitFailed');
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (statusCheck) {
    return (
      <div className="space-y-4 text-center py-6">
        {statusCheck.status === 'checking' && (
          <>
            <div className="text-2xl animate-pulse">⏳</div>
            <div className="text-text-1 font-semibold">{t('slikair.statusChecking')}</div>
            <div className="text-text-3 text-sm">{t('slikair.statusPleaseWait')}</div>
          </>
        )}
        {statusCheck.status === 'succeeded' && (
          <>
            <div className="text-2xl">✅</div>
            <div className="text-success font-semibold">{t('slikair.succeeded')}</div>
            <div className="text-text-3 text-sm">{t('slikair.statusSuccessMsg')}</div>
          </>
        )}
        {statusCheck.status === 'pending' && (
          <>
            <div className="text-2xl">⏳</div>
            <div className="text-warning font-semibold">{t('slikair.pending')}</div>
            <div className="text-text-3 text-sm">{t('slikair.statusPendingMsg')}</div>
          </>
        )}
        {statusCheck.status === 'processing' && (
          <>
            <div className="text-2xl">⚙️</div>
            <div className="text-warning font-semibold">{t('slikair.processing')}</div>
            <div className="text-text-3 text-sm">{t('slikair.statusProcessingMsg')}</div>
          </>
        )}
        {(statusCheck.status === 'failed' || statusCheck.status === 'unknown') && (
          <>
            <div className="text-2xl">❌</div>
            <div className="text-danger font-semibold">{t('slikair.failed')}</div>
            <div className="text-text-3 text-sm">{t('slikair.statusFailedMsg')}</div>
          </>
        )}
        <button onClick={() => setStatusCheck(null)}
          className="mt-4 px-6 py-2 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm font-medium hover:bg-accent/20 transition">
          {t('slikair.newDeposit')}
        </button>
      </div>
    );
  }

  const groups = ['creditCard', 'wallet', 'bank', 'crypto'];

  return (
    <div className="space-y-4">
      {groups.map(groupKey => {
        const methods = PAYMENT_METHODS.filter(m => m.group === groupKey);
        return (
          <div key={groupKey}>
            <div className="text-[10px] uppercase tracking-widest text-text-3 mb-2 font-bold">{t(GROUP_KEYS[groupKey])}</div>
            <div className="grid grid-cols-2 gap-2">
              {methods.map(m => (
                <button key={m.key} onClick={() => setPaymentMethod(m.key)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-medium border transition ${
                    paymentMethod === m.key
                      ? 'bg-accent/10 border-accent/40 text-accent'
                      : 'bg-bg-deep/30 border-white/[0.06] text-text-3 hover:text-text-2 hover:border-white/20'
                  }`}>
                  {getMethodLabel(t, m.key)}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div>
        <label className="text-xs text-text-3 mb-1 block">{t('slikair.enterAmount')}</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0.00" min="1" step="0.01"
          className="w-full bg-bg-deep/40 border border-white/10 rounded-xl px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
      </div>

      {PAYMENT_METHODS.find(m => m.key === paymentMethod)?.requiresCard && (
        <div className="space-y-3 bg-bg-deep/30 border border-white/[0.06] rounded-xl p-4">
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('slikair.cardNumber')}</label>
            <input type="text" value={cardData.cardNum} onChange={e => handleCardChange('cardNum', e.target.value)}
              placeholder="4111 1111 1111 1111" maxLength="19"
              className="w-full bg-bg-deep/40 border border-white/10 rounded-lg px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('slikair.cardHolder')}</label>
            <input type="text" value={cardData.cardHolder} onChange={e => handleCardChange('cardHolder', e.target.value)}
              placeholder="JOHN DOE"
              className="w-full bg-bg-deep/40 border border-white/10 rounded-lg px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-text-3 mb-1 block">{t('slikair.month')}</label>
              <input type="text" value={cardData.cardExpireMonth} onChange={e => handleCardChange('cardExpireMonth', e.target.value)}
                placeholder="12" maxLength="2"
                className="w-full bg-bg-deep/40 border border-white/10 rounded-lg px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="text-xs text-text-3 mb-1 block">{t('slikair.year')}</label>
              <input type="text" value={cardData.cardExpireYear} onChange={e => handleCardChange('cardExpireYear', e.target.value)}
                placeholder="2026" maxLength="4"
                className="w-full bg-bg-deep/40 border border-white/10 rounded-lg px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="text-xs text-text-3 mb-1 block">{t('slikair.cvv')}</label>
              <input type="text" value={cardData.cardCvv} onChange={e => handleCardChange('cardCvv', e.target.value)}
                placeholder="123" maxLength="4"
                className="w-full bg-bg-deep/40 border border-white/10 rounded-lg px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50" />
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-3 leading-relaxed">
        {t('slikair.cardInfoNote')}
      </p>

      <button onClick={handleSubmit} disabled={submitting || !amount}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
        style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)' }}>
        {submitting ? t('common.loading') : `${formatMoney(parseFloat(amount) || 0)} ${t('slikair.depositButton')}`}
      </button>
    </div>
  );
}
