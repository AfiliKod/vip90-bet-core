import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';

const TX_LABEL = { deposit: '📥 Para Yatır', withdraw: '📤 Para Çek', bet: '🎯 Bahis', win: '🏆 Kazanç', bonus: '🎁 Bonus', refund: '↩️ İade' };

export default function Profile() {
  const { user, updateBalance } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('deposit');
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  useEffect(() => {
    api.get('/users/me/transactions').then(r => setTransactions(r.data.transactions)).catch(() => {});
  }, []);

  const onSubmit = async (data) => {
    try {
      const endpoint = activeTab === 'deposit' ? '/transactions/deposit' : '/transactions/withdraw';
      const { data: res } = await api.post(endpoint, { amount: parseFloat(data.amount) });
      updateBalance(res.newBalance);
      addToast(res.message, 'success');
      reset();
      api.get('/users/me/transactions').then(r => setTransactions(r.data.transactions));
    } catch (e) { addToast(e.response?.data?.error?.message || 'İşlem başarısız', 'error'); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
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
        <div className="flex gap-2 mb-4">
          {[['deposit', '📥 Para Yatır'], ['withdraw', '📤 Para Çek']].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${activeTab === v ? 'bg-accent text-white' : 'text-text-2 hover:bg-bg-hover border border-white/10'}`}>{l}</button>
          ))}
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
          <input {...register('amount', { required: true, min: activeTab === 'deposit' ? 10 : 20 })}
            type="number" placeholder={activeTab === 'deposit' ? 'Min. 10₺' : 'Min. 20₺'}
            className="flex-1 bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 focus:outline-none focus:border-primary" />
          <button type="submit" disabled={isSubmitting}
            className="px-6 py-2.5 bg-primary text-bg-deep font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50">
            {activeTab === 'deposit' ? 'Yatır' : 'Çek'}
          </button>
        </form>
      </div>
      <div className="bg-bg-card border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-text-1 mb-3">İşlem Geçmişi</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {transactions.map(tx => (
            <div key={tx._id} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
              <div>
                <span className="text-text-2">{TX_LABEL[tx.type] || tx.type}</span>
                <div className="text-text-3 text-xs">{new Date(tx.createdAt).toLocaleDateString('tr-TR')}</div>
              </div>
              <span className={`font-medium ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                {tx.amount > 0 ? '+' : ''}₺{Math.abs(tx.amount).toFixed(2)}
              </span>
            </div>
          ))}
          {!transactions.length && <div className="text-text-3 text-center py-4 text-sm">İşlem bulunamadı</div>}
        </div>
      </div>
    </div>
  );
}
