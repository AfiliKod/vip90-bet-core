import { useEffect, useRef, useState } from 'react';
import { newRequestId } from '../../../utils/requestId.js';
import { useFormatters } from '../../../i18n/useFormatters.jsx';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ADMIN_BTN_GHOST } from '../../../components/admin/AdminPageHeader.jsx';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { formatMoney, getActiveCurrency } from '../../../utils/money.js';

export default function UserSlideOver({ user, onClose, onUpdated }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const [tab, setTab] = useState('general');
  const [referrals, setReferrals] = useState(null);
  const [referralTree, setReferralTree] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [casinoRounds, setCasinoRounds] = useState(null);
  const [casinoSummary, setCasinoSummary] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [rolesList, setRolesList] = useState(null);
  const [showRejectKyc, setShowRejectKyc] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [kycActing, setKycActing] = useState(false);
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
    crypto_deposit: t('admin.userSlideOver.txCryptoDeposit'), crypto_withdraw: t('admin.userSlideOver.txCryptoWithdraw'),
    casino_return: t('admin.userSlideOver.txCasinoReturn'), bonus_forfeit: t('admin.userSlideOver.txBonusForfeit'), referral_commission: t('admin.userSlideOver.txReferralCommission'),
    bonus_conversion: t('admin.userSlideOver.txBonusConversion'), agent_transfer_in: t('admin.userSlideOver.txAgentTransferIn'), agent_transfer_out: t('admin.userSlideOver.txAgentTransferOut'),
    tip_sent: t('admin.userSlideOver.txTipSent'), tip_received: t('admin.userSlideOver.txTipReceived'), rain: t('admin.userSlideOver.txRain'),
  };

  useEffect(() => {
    reset();
    setTab('general');
    setDeleteConfirm(false);
    setReferrals(null);
    setReferralTree(null);
    setTransactions(null);
    setCasinoRounds(null);
    setCasinoSummary(null);
  }, [user?._id]);

  useEffect(() => {
    if (rolesList === null) {
      api.get('/admin/roles').then(r => setRolesList(r.data.roles)).catch(() => setRolesList([]));
    }
  }, [rolesList]);

  const toggleRole = async (roleId, assigned) => {
    try {
      if (assigned) await api.delete(`/admin/users/${user._id}/roles/${roleId}`);
      else await api.post(`/admin/users/${user._id}/roles`, { roleId });
      onUpdated();
    } catch { addToast(t('common.error'), 'error'); }
  };

  useEffect(() => {
    if (!user) return;
    if (tab === 'referrals' && referrals === null)
      api.get(`/admin/users/${user._id}/referrals`).then(r => setReferrals(r.data.referrals)).catch(() => setReferrals([]));
    if (tab === 'referrals' && referralTree === null)
      api.get(`/admin/users/${user._id}/referral-tree`).then(r => setReferralTree(r.data.tree)).catch(() => setReferralTree([]));
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

  // Bir bakiye işlemi başarıyla kaydedilene kadar aynı kimlik gönderilir:
  // çift tıklama ya da hata sonrası yeniden deneme bakiyeyi iki kez değiştirmez.
  const balanceRequestId = useRef(newRequestId());

  const onBalanceSubmit = async (data) => {
    try {
      await api.patch(`/admin/users/${user._id}/balance`, {
        amount: Number(data.amount),
        type: data.type,
        note: data.note || '',
        requestId: balanceRequestId.current,
      });
      balanceRequestId.current = newRequestId();
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

  const KYC_STATUS_BADGE = {
    not_started:  'bg-white/5 text-text-3 border-white/10',
    pending:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    under_review: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    approved:     'bg-green-500/20 text-green-300 border-green-500/30',
    rejected:     'bg-red-500/20 text-red-300 border-red-500/30',
    expired:      'bg-white/5 text-text-3 border-white/10',
  };
  const KYC_STATUS_LABELS = {
    not_started: 'admin.kycReview.statusNotStarted', pending: 'admin.kycReview.statusPending',
    under_review: 'admin.kycReview.statusUnderReview', approved: 'admin.kycReview.statusApproved',
    rejected: 'admin.kycReview.statusRejected', expired: 'admin.kycReview.statusExpired',
  };

  const handleKycApprove = async () => {
    setKycActing(true);
    try {
      await api.post(`/admin/users/${user._id}/kyc/approve`);
      addToast(t('admin.kycReview.approved'), 'success');
      onUpdated();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.kycReview.approveFailed'), 'error');
    } finally { setKycActing(false); }
  };

  const handleKycReject = async () => {
    if (!rejectReason.trim()) return;
    setKycActing(true);
    try {
      await api.post(`/admin/users/${user._id}/kyc/reject`, { reason: rejectReason });
      addToast(t('admin.kycReview.rejected'), 'success');
      setShowRejectKyc(false);
      setRejectReason('');
      onUpdated();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.kycReview.rejectFailed'), 'error');
    } finally { setKycActing(false); }
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/igames?tab=bonus&user=' + encodeURIComponent(user.username))}
              className={ADMIN_BTN_GHOST}
            >
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">redeem</span>
              {t('admin.casinoPromo.giveFromPlayer')}
            </button>
            <button onClick={onClose} className="text-text-3 hover:text-text-1 text-2xl leading-none">&times;</button>
          </div>
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

              {/* Crypto Bakiye Özeti */}
              <div className="bg-bg-hover rounded-xl p-3">
                <div className="text-xs text-text-3 mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">currency_bitcoin</span>
                  {t('admin.crypto.balanceSummary')}
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <div><span className="text-text-3">{t('admin.crypto.balanceTotal')}: </span><span className="font-semibold text-text-1">{formatMoney(user.balance)}</span></div>
                  <div><span className="text-text-3">{t('admin.crypto.balanceBonusLocked')}: </span><span className="font-semibold text-yellow-400">{formatMoney(user.bonusBalance || 0)}</span></div>
                  <div><span className="text-text-3">{t('admin.crypto.balanceWithdrawable')}: </span><span className={`font-semibold ${(user.balance - (user.bonusBalance || 0)) > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(Math.max(0, user.balance - (user.bonusBalance || 0)))}</span></div>
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
                {rolesList && rolesList.length > 0 && (
                  <div className="p-3 bg-bg-hover rounded-xl">
                    <div className="text-sm text-text-2 mb-2">{t('admin.userSlideOver.extraRoles')}</div>
                    <div className="flex flex-wrap gap-2">
                      {rolesList.map(role => {
                        const assigned = (user.roles || []).some(r => (r._id || r) === role._id);
                        return (
                          <button
                            key={role._id}
                            onClick={() => toggleRole(role._id, assigned)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                              assigned
                                ? 'bg-primary/20 text-primary border-primary/30'
                                : 'border-white/10 text-text-3 hover:text-text-1 hover:border-white/25'
                            }`}
                          >
                            {role.displayName}
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-[11px] text-text-3/70 mt-2 leading-snug">
                      {t('admin.userSlideOver.extraRolesHelp')}
                    </div>
                  </div>
                )}
                <div className="p-3 bg-bg-hover rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-2">{t('admin.userSlideOver.kycIdentity')}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${KYC_STATUS_BADGE[user.kycStatus] || KYC_STATUS_BADGE.not_started}`}>
                      {KYC_STATUS_LABELS[user.kycStatus] ? t(KYC_STATUS_LABELS[user.kycStatus]) : user.kycStatus}
                    </span>
                  </div>
                  {user.kycRejectionReason && (
                    <div className="text-[11px] text-red-300 mb-1">{t('admin.userSlideOver.reasonLabel', { reason: user.kycRejectionReason })}</div>
                  )}
                  {(user.kycStatus === 'pending' || user.kycStatus === 'under_review') && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleKycApprove} disabled={kycActing}
                        className="flex-1 py-1.5 rounded-lg bg-success/20 text-success text-xs font-medium hover:bg-success/30 transition disabled:opacity-40">
                        {t('admin.kycReview.approve')}
                      </button>
                      <button onClick={() => setShowRejectKyc(true)} disabled={kycActing}
                        className="flex-1 py-1.5 rounded-lg bg-danger/20 text-danger text-xs font-medium hover:bg-danger/30 transition disabled:opacity-40">
                        {t('admin.kycReview.reject')}
                      </button>
                    </div>
                  )}
                  {user.kycStatus === 'not_started' && (
                    <button onClick={handleKycApprove} disabled={kycActing}
                      className="w-full mt-2 py-1.5 rounded-lg bg-success/20 text-success text-xs font-medium hover:bg-success/30 transition disabled:opacity-40">
                      {t('admin.userSlideOver.manualApprove')}
                    </button>
                  )}
                  {showRejectKyc && (
                    <div className="mt-2 space-y-2">
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        placeholder={t('admin.kycReview.rejectPlaceholder')}
                        className="w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-1 focus:outline-none focus:border-white/25" />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowRejectKyc(false); setRejectReason(''); }}
                          className="flex-1 py-1.5 rounded-lg border border-white/10 text-text-3 text-xs hover:bg-bg-hover transition">
                          {t('common.cancel')}
                        </button>
                        <button onClick={handleKycReject} disabled={!rejectReason.trim() || kycActing}
                          className="flex-1 py-1.5 rounded-lg bg-danger text-white text-xs font-semibold hover:bg-danger/80 transition disabled:opacity-40">
                          {kycActing ? '...' : t('admin.kycReview.reject')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">{t('admin.userSlideOver.accountStatus')}</span>
                  <button
                    onClick={() => patch({ isActive: !user.isActive })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${user.isActive ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-success/20 text-success hover:bg-success/30'}`}>
                    {user.isActive ? t('admin.userSlideOver.suspend') : t('admin.userSlideOver.activate')}
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-bg-hover rounded-xl">
                  <span className="text-sm text-text-2">{t('admin.userSlideOver.emailVerification')}</span>
                  {user.emailVerified ? (
                    <span className="px-3 py-1 rounded-lg text-xs font-medium bg-success/20 text-success">{t('admin.userSlideOver.emailVerified')}</span>
                  ) : (
                    <button
                      onClick={() => patch({ emailVerified: true })}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition bg-primary/20 text-primary hover:bg-primary/30">
                      {t('admin.userSlideOver.markEmailVerified')}
                    </button>
                  )}
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
              <div>
                <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">{t('admin.userSlideOver.referralTree3')}</div>
                <div className="text-[11px] text-text-3/70 mb-2 leading-snug">{t('admin.userSlideOver.referralTreeHelp')}</div>
                {referralTree === null ? (
                  <div className="text-center text-text-3 text-sm py-4">{t('common.loading')}</div>
                ) : referralTree.length === 0 ? (
                  <div className="text-center text-text-3 text-sm py-4">{t('admin.userSlideOver.noReferralsYet')}</div>
                ) : (
                  <div className="space-y-1">
                    {referralTree.map(node => (
                      <ReferralTreeNode key={node._id} node={node} depth={0} />
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
              {(user.dailyStats || user.weeklyStats || user.monthlyStats) && (
                <div className="mb-4">
                  <div className="text-xs text-text-3 mb-2 uppercase tracking-wide">{t('admin.userSlideOver.rgStats')}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'daily', label: t('admin.userSlideOver.rgDaily'), stats: user.dailyStats },
                      { key: 'weekly', label: t('admin.userSlideOver.rgWeekly'), stats: user.weeklyStats },
                      { key: 'monthly', label: t('admin.userSlideOver.rgMonthly'), stats: user.monthlyStats },
                    ].map(({ key, label, stats }) => (
                      <div key={key} className="bg-bg-hover rounded-xl p-2.5">
                        <div className="text-[10px] text-text-3 mb-1.5">{label}</div>
                        <div className="text-[11px] text-text-2 flex justify-between"><span>{t('admin.userSlideOver.rgDeposited')}</span><span className="font-semibold text-text-1">{formatMoney(stats?.deposits || 0)}</span></div>
                        <div className="text-[11px] text-text-2 flex justify-between"><span>{t('admin.userSlideOver.rgWagered')}</span><span className="font-semibold text-text-1">{formatMoney(stats?.wagers || 0)}</span></div>
                        {/* 3. parti casino (Igames) "kötümser varsayım" deseni yüzünden losses
                            geçici olarak negatif olabilir (kazanç, birikmiş kaybı aşınca) —
                            admin ekranında bu bir "kayıp" değil, 0 olarak gösterilir. */}
                        <div className="text-[11px] text-text-2 flex justify-between"><span>{t('admin.userSlideOver.rgLost')}</span><span className="font-semibold text-danger">{formatMoney(Math.max(0, stats?.losses || 0))}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

/** O2 — 3 seviyeye kadar salt-okunur affiliate ağacı düğümü. */
function ReferralTreeNode({ node, depth }) {
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center justify-between bg-bg-hover rounded-lg px-3 py-1.5 text-xs">
        <span className="text-text-1 font-medium">{'└ '.repeat(depth > 0 ? 1 : 0)}{node.username}</span>
        <span className={node.isActive ? 'text-text-3' : 'text-danger'}>{node.isActive ? '' : '⏸'}</span>
      </div>
      {node.children?.map(child => (
        <ReferralTreeNode key={child._id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
