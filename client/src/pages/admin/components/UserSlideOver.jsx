import { useEffect, useState } from 'react';
import { useFormatters } from '../../../i18n/useFormatters.jsx';
import { useForm } from 'react-hook-form';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { formatMoney, getActiveCurrency } from '../../../utils/money.js';

export default function UserSlideOver({ user, onClose, onUpdated }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [tab, setTab] = useState('general');
  const [referrals, setReferrals] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [casinoRounds, setCasinoRounds] = useState(null);
  const [casinoSummary, setCasinoSummary] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const addToast = useToastStore(s => s.add);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();

  const TABS = [
    { id: 'general',   label: t('admin.userSlideOver.tabGeneral') },
    { id: 'balance',   label: t('admin.userSlideOver.tabBalance') },
    { id: 'referrals', label: t('admin.userSlideOver.tabReferrals') },
    { id: 'history',   label: t('admin.userSlideOver.tabHistory') },
    { id: 'casino',    label: t('admin.userSlideOver.tabCasino') },
  ];

  const TX_LABELS = {
    deposit: t('admin.userSlideOver.txDeposit'), withdraw: t('admin.userSlideOver.txWithdraw'), bet: t('admin.userSlideOver.txBet'),
    win: t('admin.userSlideOver.txWin'), bonus: t('admin.userSlideOver.txBonus'), refund: t('admin.userSlideOver.txRefund'), admin_adjustment: t('admin.userSlideOver.txAdmin'),
  };

  useEffect(() => {
    reset();
    setTab('general');
    setDeleteConfirm(false);
    setReferrals(null);
    setTransactions(null);
    setCasinoRounds(null);
    setCasinoSummary(null);
  }, [user?._id]);

  useEffect(() => {
    if (!user) return;
    if (tab === 'referrals' && referrals === null)
      api.get(`/admin/users/${user._id}/referrals`).then(r => setReferrals(r.data.referrals)).catch(() => setReferrals([]));
    if (tab === 'history' && transactions === null)
      api.get(`/admin/users/${user._id}/transactions`).then(r => setTransactions(r.data.transactions)).catch(() => setTransactions([]));
    if (tab === 'casino' && casinoRounds === null)
      api.get(`/admin/users/${user._id}/casino-rounds`).then(r => {
        setCasinoRounds(r.data.rounds);
        setCasinoSummary(r.data.summary);
      }).catch(() => { setCasinoRounds([]); setCasinoSummary(null); });
  }, [tab, user]);

  const patch = async (data) => {
    try {
      await api.patch(`/admin/users/${user._id}`, data);
      addToast(t('admin.userSlideOver.updated'), 'success');
      onUpdated();
    } catch { addToast(t('common.error'), 'error'); }
  };

  const onBalanceSubmit = async (data) => {
    try {
      await api.patch(`/admin/users/${user._id}/balance`, {
        amount: Number(data.amount),
        type: data.type,
        note: data.note || '',
      });
      addToast(t('admin.userSlideOver.balanceUpdated'), 'success');
      reset();
      onUpdated();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('common.error'), 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/users/${user._id}`);
      addToast(t('admin.userSlideOver.userDeleted'), 'success');
      onClose();
      onUpdated();
    } catch { addToast(t('admin.userSlideOver.deleteFailed'), 'error'); }
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
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${tab === tb.id ? 'text-primary border-b-2 border-primary' : 'text-text-3 hover:text-text-1'}`}>
              {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* GENEL */}
          {tab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">{t('admin.userSlideOver.balance')}</div>
                  <div className="font-bold text-primary">{formatMoney(user.balance)}</div>
                </div>
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">{t('admin.userSlideOver.registration')}</div>
                  <div className="text-sm text-text-1">{fmt.formatDate(user.createdAt)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">{t('admin.userSlideOver.role')}</span>
                  <select
                    defaultValue={user.role}
                    onChange={e => patch({ role: e.target.value })}
                    className="bg-transparent text-sm text-text-1 focus:outline-none">
                    <option value="user">{t('admin.userSlideOver.roleUser')}</option>
                    <option value="admin">{t('admin.userSlideOver.roleAdmin')}</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">{t('admin.userSlideOver.kycVerified')}</span>
                  <input type="checkbox" defaultChecked={user.kycVerified}
                    onChange={e => patch({ kycVerified: e.target.checked })}
                    className="w-4 h-4 accent-primary" />
                </div>
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">{t('admin.userSlideOver.accountStatus')}</span>
                  <button
                    onClick={() => patch({ isActive: !user.isActive })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${user.isActive ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-success/20 text-success hover:bg-success/30'}`}>
                    {user.isActive ? t('admin.userSlideOver.suspend') : t('admin.userSlideOver.activate')}
                  </button>
                </div>
              </div>

              {!user.deletedAt && (
                <div className="pt-2 border-t border-white/5">
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="w-full py-2 rounded-lg bg-danger/10 text-danger text-sm font-medium hover:bg-danger/20 transition">
                      {t('admin.userSlideOver.deleteUser')}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-text-3 text-center">{t('admin.userSlideOver.deleteConfirm')}</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteConfirm(false)}
                          className="flex-1 py-2 rounded-lg border border-white/10 text-text-3 text-sm hover:bg-bg-hover transition">
                          {t('common.cancel')}
                        </button>
                        <button onClick={handleDelete}
                          className="flex-1 py-2 rounded-lg bg-danger text-white text-sm font-semibold hover:bg-danger/80 transition">
                          {t('admin.userSlideOver.yesDelete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {user.deletedAt && (
                <div className="text-center text-xs text-danger/70 py-2">
                  {t('admin.userSlideOver.deletedOn', { date: fmt.formatDate(user.deletedAt) })}
                </div>
              )}
            </div>
          )}

          {/* BAKİYE */}
          {tab === 'balance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">{t('admin.userSlideOver.mainBalance')}</div>
                  <div className="font-bold text-primary">{formatMoney(user.balance)}</div>
                </div>
                <div className="bg-bg-hover rounded-xl p-3">
                  <div className="text-xs text-text-3 mb-1">{t('admin.userSlideOver.bonusBalance')}</div>
                  <div className="font-bold text-yellow-400">{formatMoney(user.bonusBalance ?? 0)}</div>
                </div>
              </div>
              <form onSubmit={handleSubmit(onBalanceSubmit)} className="space-y-3">
                <div>
                  <label className="text-xs text-text-3 mb-1 block">{t('admin.userSlideOver.amountLabel', { symbol: getActiveCurrency().symbol })}</label>
                  <input type="number" step="0.01" min="0.01"
                    {...register('amount', { required: true, min: 0.01 })}
                    className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-xs text-text-3 mb-1 block">{t('admin.userSlideOver.transactionLabel')}</label>
                  <div className="flex gap-2">
                    {[['credit', t('admin.userSlideOver.opCredit')],['debit', t('admin.userSlideOver.opDebit')],['bonus', t('admin.userSlideOver.opBonus')]].map(([val, label]) => (
                      <label key={val} className="flex-1 flex items-center gap-2 bg-bg-hover border border-white/10 rounded-lg p-2.5 cursor-pointer has-[:checked]:border-primary/50">
                        <input type="radio" value={val} {...register('type', { required: true })} className="accent-primary" />
                        <span className="text-sm text-text-1">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-3 mb-1 block">{t('admin.userSlideOver.noteOptional')}</label>
                  <input {...register('note')}
                    className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50"
                    placeholder={t('admin.userSlideOver.notePlaceholder')} />
                </div>
                <button type="submit" disabled={isSubmitting}
                  className="w-full py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
                  {isSubmitting ? t('admin.userSlideOver.saving') : t('common.save')}
                </button>
              </form>
            </div>
          )}

          {/* REFERANSLAR */}
          {tab === 'referrals' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">{t('admin.userSlideOver.referredBy')}</div>
                <div className="bg-bg-hover rounded-xl p-3 text-sm text-text-1">
                  {user.referredBy ? (
                    <span className="text-primary font-medium">{user.referredBy?.username || user.referredBy}</span>
                  ) : (
                    <span className="text-text-3">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">{t('admin.userSlideOver.referredUsers')}</div>
                {referrals === null ? (
                  <div className="text-center text-text-3 text-sm py-4">{t('common.loading')}</div>
                ) : referrals.length === 0 ? (
                  <div className="text-center text-text-3 text-sm py-4">{t('admin.userSlideOver.noReferralsYet')}</div>
                ) : (
                  <div className="space-y-2">
                    {referrals.map(r => (
                      <div key={r._id} className="flex items-center justify-between bg-bg-hover rounded-xl p-3">
                        <span className="text-sm text-text-1 font-medium">{r.username}</span>
                        <span className="text-xs text-text-3">{fmt.formatDate(r.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GEÇMİŞ */}
          {tab === 'history' && (
            <div>
              {transactions === null ? (
                <div className="text-center text-text-3 text-sm py-4">{t('common.loading')}</div>
              ) : transactions.length === 0 ? (
                <div className="text-center text-text-3 text-sm py-4">{t('admin.userSlideOver.noTransactionHistory')}</div>
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
                          {tx.amount >= 0 ? '+' : ''}{formatMoney(tx.amount)}
                        </div>
                        <div className="text-xs text-text-3">{fmt.formatDate(tx.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CASİNO */}
          {tab === 'casino' && (
            <div>
              {casinoSummary && (
                <div className="mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-bg-hover rounded-xl p-3">
                      <div className="text-xs text-text-3 mb-1">{t('admin.userSlideOver.bonusWageringContribution')}</div>
                      <div className="font-bold text-yellow-400">{formatMoney(casinoSummary.bonusAttributedBet)}</div>
                    </div>
                    <div className="bg-bg-hover rounded-xl p-3">
                      <div className="text-xs text-text-3 mb-1">{t('admin.userSlideOver.pureRealBalance')}</div>
                      <div className="font-bold text-primary">{formatMoney(casinoSummary.realBet)}</div>
                    </div>
                  </div>
                  {casinoSummary.byGame.length > 0 && (
                    <div>
                      <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">{t('admin.userSlideOver.gameBreakdown')}</div>
                      <div className="space-y-1.5">
                        {casinoSummary.byGame.map(g => (
                          <div key={g._id} className="flex items-center justify-between bg-bg-hover rounded-lg p-2 text-xs">
                            <span className="text-text-1 font-medium truncate max-w-[45%]">{g.gameTitle || g._id}</span>
                            <span className="text-text-3">{t('admin.userSlideOver.roundsCount', { count: g.rounds })}</span>
                            <span className="text-primary font-bold">{formatMoney(g.totalBet)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {casinoRounds === null ? (
                <div className="text-center text-text-3 text-sm py-4">{t('common.loading')}</div>
              ) : casinoRounds.length === 0 ? (
                <div className="text-center text-text-3 text-sm py-4">{t('admin.userSlideOver.noCasinoHistory')}</div>
              ) : (
                <div className="space-y-2">
                  {casinoRounds.map((r, i) => (
                    <div key={i} className="bg-bg-hover rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-text-1 font-medium truncate max-w-[60%]">
                          {r.gameTitle || r.gameId}
                        </div>
                        <div className={`text-sm font-bold ${r.net >= 0 ? 'text-success' : 'text-danger'}`}>
                          {r.net >= 0 ? '+' : ''}{formatMoney(r.net)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-text-3">
                        <span>{t('admin.userSlideOver.roundLine', { provider: r.provider, bet: formatMoney(r.bet), payout: formatMoney(r.payout) })}</span>
                        <span>{fmt.formatDate(r.createdAt)}</span>
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
