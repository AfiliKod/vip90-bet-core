import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';

const TABS = ['Genel', 'Bakiye', 'Referanslar', 'Geçmiş', 'Casino'];

const TX_LABELS = {
  deposit: 'Yatırım', withdraw: 'Çekim', bet: 'Bahis',
  win: 'Kazanç', bonus: 'Bonus', refund: 'İade', admin_adjustment: 'Admin',
};

export default function UserSlideOver({ user, onClose, onUpdated }) {
  const [tab, setTab] = useState('Genel');
  const [referrals, setReferrals] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [casinoRounds, setCasinoRounds] = useState(null);
  const [casinoSummary, setCasinoSummary] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const addToast = useToastStore(s => s.add);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  useEffect(() => {
    reset();
    setTab('Genel');
    setDeleteConfirm(false);
    setReferrals(null);
    setTransactions(null);
    setCasinoRounds(null);
    setCasinoSummary(null);
  }, [user?._id]);

  useEffect(() => {
    if (!user) return;
    if (tab === 'Referanslar' && referrals === null)
      api.get(`/admin/users/${user._id}/referrals`).then(r => setReferrals(r.data.referrals)).catch(() => setReferrals([]));
    if (tab === 'Geçmiş' && transactions === null)
      api.get(`/admin/users/${user._id}/transactions`).then(r => setTransactions(r.data.transactions)).catch(() => setTransactions([]));
    if (tab === 'Casino' && casinoRounds === null)
      api.get(`/admin/users/${user._id}/casino-rounds`).then(r => {
        setCasinoRounds(r.data.rounds);
        setCasinoSummary(r.data.summary);
      }).catch(() => { setCasinoRounds([]); setCasinoSummary(null); });
  }, [tab, user]);

  const patch = async (data) => {
    try {
      await api.patch(`/admin/users/${user._id}`, data);
      addToast('Güncellendi', 'success');
      onUpdated();
    } catch { addToast('Hata oluştu', 'error'); }
  };

  const onBalanceSubmit = async (data) => {
    try {
      await api.patch(`/admin/users/${user._id}/balance`, {
        amount: Number(data.amount),
        type: data.type,
        note: data.note || '',
      });
      addToast('Bakiye güncellendi', 'success');
      reset();
      onUpdated();
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'Hata oluştu', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/users/${user._id}`);
      addToast('Kullanıcı silindi', 'success');
      onClose();
      onUpdated();
    } catch { addToast('Silinemedi', 'error'); }
  };

  if (!user) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-bg-card border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <div className="font-bold text-text-1">{user.username}</div>
            <div className="text-xs text-text-3">{user.email}</div>
          </div>
          <button onClick={onClose} className="text-text-3 hover:text-text-1 text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-text-3 hover:text-text-1'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* GENEL */}
          {tab === 'Genel' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">Bakiye</div>
                  <div className="font-bold text-primary">₺{user.balance?.toFixed(2)}</div>
                </div>
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">Kayıt</div>
                  <div className="text-sm text-text-1">{new Date(user.createdAt).toLocaleDateString('tr')}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">Rol</span>
                  <select
                    defaultValue={user.role}
                    onChange={e => patch({ role: e.target.value })}
                    className="bg-transparent text-sm text-text-1 focus:outline-none">
                    <option value="user">Kullanıcı</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">KYC Onaylı</span>
                  <input type="checkbox" defaultChecked={user.kycVerified}
                    onChange={e => patch({ kycVerified: e.target.checked })}
                    className="w-4 h-4 accent-primary" />
                </div>
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">Hesap Durumu</span>
                  <button
                    onClick={() => patch({ isActive: !user.isActive })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${user.isActive ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-success/20 text-success hover:bg-success/30'}`}>
                    {user.isActive ? 'Askıya Al' : 'Aktifleştir'}
                  </button>
                </div>
              </div>

              {!user.deletedAt && (
                <div className="pt-2 border-t border-white/5">
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="w-full py-2 rounded-lg bg-danger/10 text-danger text-sm font-medium hover:bg-danger/20 transition">
                      Kullanıcıyı Sil
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-text-3 text-center">Bu işlem geri alınamaz. Emin misin?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteConfirm(false)}
                          className="flex-1 py-2 rounded-lg border border-white/10 text-text-3 text-sm hover:bg-bg-hover transition">
                          İptal
                        </button>
                        <button onClick={handleDelete}
                          className="flex-1 py-2 rounded-lg bg-danger text-white text-sm font-semibold hover:bg-danger/80 transition">
                          Evet, Sil
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {user.deletedAt && (
                <div className="text-center text-xs text-danger/70 py-2">
                  Silinmiş — {new Date(user.deletedAt).toLocaleDateString('tr')}
                </div>
              )}
            </div>
          )}

          {/* BAKİYE */}
          {tab === 'Bakiye' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">Ana Bakiye</div>
                  <div className="font-bold text-primary">₺{user.balance?.toFixed(2)}</div>
                </div>
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">Bonus Bakiye</div>
                  <div className="font-bold text-yellow-400">₺{(user.bonusBalance ?? 0).toFixed(2)}</div>
                </div>
              </div>
              <form onSubmit={handleSubmit(onBalanceSubmit)} className="space-y-3">
                <div>
                  <label className="text-xs text-text-3 mb-1 block">Miktar (₺)</label>
                  <input type="number" step="0.01" min="0.01"
                    {...register('amount', { required: true, min: 0.01 })}
                    className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-xs text-text-3 mb-1 block">İşlem</label>
                  <div className="flex gap-2">
                    {[['credit','Ekle'],['debit','Çıkar'],['bonus','Bonus Ver']].map(([val, label]) => (
                      <label key={val} className="flex-1 flex items-center gap-2 bg-bg-hover border border-white/10 rounded-lg p-2.5 cursor-pointer has-[:checked]:border-primary/50">
                        <input type="radio" value={val} {...register('type', { required: true })} className="accent-primary" />
                        <span className="text-sm text-text-1">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-3 mb-1 block">Not (isteğe bağlı)</label>
                  <input {...register('note')}
                    className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50"
                    placeholder="Örn: Promosyon yüklemesi" />
                </div>
                <button type="submit" disabled={isSubmitting}
                  className="w-full py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
                  {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </form>
            </div>
          )}

          {/* REFERANSLAR */}
          {tab === 'Referanslar' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">Kim Davet Etti</div>
                <div className="bg-bg-hover rounded-xl p-3 text-sm text-text-1">
                  {user.referredBy ? (
                    <span className="text-primary font-medium">{user.referredBy?.username || user.referredBy}</span>
                  ) : (
                    <span className="text-text-3">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">Davet Ettikleri</div>
                {referrals === null ? (
                  <div className="text-center text-text-3 text-sm py-4">Yükleniyor…</div>
                ) : referrals.length === 0 ? (
                  <div className="text-center text-text-3 text-sm py-4">Henüz kimseyi davet etmemiş</div>
                ) : (
                  <div className="space-y-2">
                    {referrals.map(r => (
                      <div key={r._id} className="flex items-center justify-between bg-bg-hover rounded-xl p-3">
                        <span className="text-sm text-text-1 font-medium">{r.username}</span>
                        <span className="text-xs text-text-3">{new Date(r.createdAt).toLocaleDateString('tr')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GEÇMİŞ */}
          {tab === 'Geçmiş' && (
            <div>
              {transactions === null ? (
                <div className="text-center text-text-3 text-sm py-4">Yükleniyor…</div>
              ) : transactions.length === 0 ? (
                <div className="text-center text-text-3 text-sm py-4">İşlem geçmişi yok</div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx, i) => (
                    <div key={i} className="flex items-center justify-between bg-bg-hover rounded-xl p-3">
                      <div>
                        <div className="text-sm text-text-1 font-medium">{TX_LABELS[tx.type] || tx.type}</div>
                        {tx.note && <div className="text-xs text-text-3">{tx.note}</div>}
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${tx.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                          {tx.amount >= 0 ? '+' : ''}₺{tx.amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-text-3">{new Date(tx.createdAt).toLocaleDateString('tr')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CASİNO */}
          {tab === 'Casino' && (
            <div>
              {casinoSummary && (
                <div className="mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-bg-hover rounded-xl p-3">
                      <div className="text-xs text-text-3 mb-1">Bonus Çevrimine Katkı</div>
                      <div className="font-bold text-yellow-400">₺{casinoSummary.bonusAttributedBet.toFixed(2)}</div>
                    </div>
                    <div className="bg-bg-hover rounded-xl p-3">
                      <div className="text-xs text-text-3 mb-1">Salt Gerçek Bakiye</div>
                      <div className="font-bold text-primary">₺{casinoSummary.realBet.toFixed(2)}</div>
                    </div>
                  </div>
                  {casinoSummary.byGame.length > 0 && (
                    <div>
                      <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">Oyun Kırılımı</div>
                      <div className="space-y-1.5">
                        {casinoSummary.byGame.map(g => (
                          <div key={g._id} className="flex items-center justify-between bg-bg-hover rounded-lg p-2 text-xs">
                            <span className="text-text-1 font-medium truncate max-w-[45%]">{g.gameTitle || g._id}</span>
                            <span className="text-text-3">{g.rounds} tur</span>
                            <span className="text-primary font-bold">₺{g.totalBet.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {casinoRounds === null ? (
                <div className="text-center text-text-3 text-sm py-4">Yükleniyor…</div>
              ) : casinoRounds.length === 0 ? (
                <div className="text-center text-text-3 text-sm py-4">Casino geçmişi yok</div>
              ) : (
                <div className="space-y-2">
                  {casinoRounds.map((r, i) => (
                    <div key={i} className="bg-bg-hover rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-text-1 font-medium truncate max-w-[60%]">
                          {r.gameTitle || r.gameId}
                        </div>
                        <div className={`text-sm font-bold ${r.net >= 0 ? 'text-success' : 'text-danger'}`}>
                          {r.net >= 0 ? '+' : ''}₺{r.net.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-text-3">
                        <span>{r.provider} · Bahis: ₺{r.bet.toFixed(2)} · Ödeme: ₺{r.payout.toFixed(2)}</span>
                        <span>{new Date(r.createdAt).toLocaleDateString('tr')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
