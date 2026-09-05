import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '../i18n';
import { formatMoney } from '../utils/money.js';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';
import WinnersPanel from '../components/home/WinnersPanel';

export default function Promotions() {
  const { t } = useTranslation();
  const [promos, setPromos] = useState([]);
  const [activePromo, setActivePromo] = useState(null);
  const [acceptedTC, setAcceptedTC] = useState(false);
  const addToast = useToastStore(s => s.add);
  const user = useAuthStore(s => s.user);
  const updateBonusBalance = useAuthStore(s => s.updateBonusBalance);

  useEffect(() => { api.get('/promotions').then(r => setPromos(r.data.promotions)).catch(() => {}); }, []);

  async function claim() {
    if (!activePromo || !acceptedTC) return;
    try {
      const { data } = await api.post(`/promotions/${activePromo._id}/claim`, {
        acceptedBonusTerms: true,
      });
      addToast(data.message, 'success');
      // Claim yanıtındaki güncel bonusBalance'ı store'a yaz — yoksa UI (Profile/başlık
      // bonus göstergesi) reload'a kadar stale kalıyordu.
      if (typeof data.bonusBalance === 'number') updateBonusBalance(data.bonusBalance);
      setPromos(p => p.map(x => x._id === activePromo._id ? { ...x, claimedBy: [...(x.claimedBy || []), user?._id] } : x));
      setActivePromo(null);
      setAcceptedTC(false);
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('promotions.claimFailed'), 'error');
    }
  }

  return (
    <div className="px-4 py-6 lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start max-w-6xl mx-auto">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-2xl font-black text-text-1 mb-6">🎁 {t('nav.promotions')}</h1>
        <div className="grid gap-4">
          <div className="rounded-xl p-5 flex items-center justify-between gap-4" style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-text-1 mb-1">🎁 {t('promotions.referralTitle')}</h3>
              <p className="text-text-3 text-sm">{t('promotions.referralDesc')}</p>
            </div>
            <Link to="/profile"
              className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold text-bg-deep bg-gradient-to-r from-primary to-accent hover:opacity-90 transition">
              {t('promotions.getMyLink')}
            </Link>
          </div>
          {promos.map(p => {
            const claimed = p.claimedBy?.some(id => id === user?._id);
            return (
              <div key={p._id} className="rounded-xl p-5 flex items-center justify-between gap-4" style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-text-1 mb-1">{p.title}</h3>
                  <p className="text-text-3 text-sm mb-3">{p.description}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-text-3">
                    <span className="bg-bg-base px-2 py-1 rounded">💰 {formatMoney(p.amount)}</span>
                    <span className="bg-bg-base px-2 py-1 rounded">📊 {t('promotions.minOdds')}: {p.minOdds}</span>
                    <span className="bg-bg-base px-2 py-1 rounded">🔄 {p.wageringMultiplier ?? p.wagering}x {t('promotions.wagering')}</span>
                    {p.deadlineDays && <span className="bg-bg-base px-2 py-1 rounded">⏰ {p.deadlineDays}{t('promotions.daysShort')}</span>}
                  </div>
                </div>
                <button
                  onClick={() => !claimed && setActivePromo(p)}
                  disabled={claimed}
                  className={`shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                    claimed ? 'bg-bg-base text-text-3 cursor-not-allowed' : 'text-bg-deep bg-gradient-to-r from-primary to-accent hover:opacity-90'
                  }`}
                >
                  {claimed ? `✓ ${t('promotions.used')}` : t('promotions.use')}
                </button>
              </div>
            );
          })}
          {!promos.length && <div className="text-center text-text-3 py-12">{t('promotions.noneFound')}</div>}
        </div>
      </div>

      <div className="hidden lg:block mt-[52px]">
        <WinnersPanel />
      </div>

      {/* T&C Modal (Phase A5) */}
      {activePromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="max-w-md w-full rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text-1">{activePromo.title}</h3>
              <button onClick={() => { setActivePromo(null); setAcceptedTC(false); }} className="text-text-3 hover:text-text-1 text-xl leading-none">×</button>
            </div>

            <div className="space-y-3 mb-5">
              <DetailRow label={t('promotions.bonusAmount')} value={formatMoney(activePromo.amount)} />
              <DetailRow label={t('promotions.wageringRequirement')} value={`${activePromo.wageringMultiplier ?? activePromo.wagering}x`} />
              <DetailRow label={t('promotions.minOdds')} value={activePromo.minOdds} />
              {activePromo.deadlineDays && <DetailRow label={t('promotions.duration')} value={`${activePromo.deadlineDays} ${t('promotions.daysWord')}`} />}
              <DetailRow label={t('promotions.gameWeights')} value={t('promotions.gameWeightsValue')} small />
            </div>

            <div className="text-xs space-y-1.5 mb-4 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', color: '#8899bb' }}>
              <p>• {t('promotions.ruleWithdrawCancel')}</p>
              <p>• {t('promotions.ruleMaxBet', { slot: formatMoney(50), sports: formatMoney(100) })}</p>
              <p>• {t('promotions.ruleHedgeCancel')}</p>
              <p>
                {t('promotions.detailedTermsPrefix')}{' '}
                <Link to="/legal/bonus-terms" target="_blank" className="underline text-primary">
                  {t('promotions.bonusTermsLink')}
                </Link>
                {t('promotions.detailedTermsSuffix')}
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={acceptedTC}
                onChange={e => setAcceptedTC(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded cursor-pointer accent-primary"
              />
              <span className="text-xs leading-relaxed" style={{ color: '#c8d8f0' }}>
                {t('promotions.acceptTerms')}
              </span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => { setActivePromo(null); setAcceptedTC(false); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-white/10 hover:border-white/20 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={claim}
                disabled={!acceptedTC}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-bg-deep bg-gradient-to-r from-primary to-accent hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('promotions.getBonus')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, small }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-text-3">{label}</span>
      <span className={`font-bold text-text-1 ${small ? 'text-xs' : ''}`}>{value}</span>
    </div>
  );
}
