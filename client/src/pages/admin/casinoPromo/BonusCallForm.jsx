import { useMemo, useState } from 'react';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { formatMoney } from '../../../utils/money';
import { ADMIN_BTN_PRIMARY } from '../../../components/admin/AdminPageHeader.jsx';
import ConfirmButton from './ConfirmButton.jsx';
import { promoErrorMessage } from './promoErrors.js';

const MAX_SET_POINT = 100000; // sunucu: services/casinoPromo/limits.js

export default function BonusCallForm({ plays, playsLoading, onRefresh, config, initialUser, onDone }) {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [gplayId, setGplayId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  // initialUser'ın oturumları en üstte ve vurgulu.
  const sorted = useMemo(() => {
    if (!initialUser) return plays;
    const mine = (p) => p.user_name === initialUser;
    return [...plays].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  }, [plays, initialUser]);

  const selected = plays.find(p => String(p.gplay_id) === String(gplayId));
  const callMin = Number(config?.callMin) || 0;
  const n = Number(amount);
  const valid = n > 0 && n >= callMin && n <= MAX_SET_POINT;
  const balanceLow = config?.agentBalance != null && n > 0 && n > config.agentBalance;

  async function submit() {
    if (!selected || !valid) return;
    setBusy(true);
    try {
      await api.post('/admin/igames/bonus/start', {
        gplay_id: Number(gplayId), set_point: n, memo: memo || undefined,
      });
      addToast(t('admin.casinoPromo.bonusStarted'), 'success');
      setGplayId(''); setAmount(''); setMemo('');
      onRefresh();
      onDone();
    } catch (e) {
      addToast(promoErrorMessage(e, t), 'error');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none';
  const label = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3';

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={label + ' !mb-0'}>{t('admin.casinoPromo.activePlays')}</span>
        <button type="button" onClick={onRefresh} disabled={playsLoading}
          className="inline-flex items-center gap-1 text-xs font-bold text-text-2 transition hover:text-text-1 disabled:opacity-40">
          <span className={`material-symbols-outlined !text-[15px] ${playsLoading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
          {t('common.refresh')}
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className="mb-3 rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-text-3">
          {playsLoading ? t('common.loading') : t('admin.casinoPromo.noActivePlays')}
        </div>
      ) : (
        <div className="mb-3 max-h-64 divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/10 bg-bg-deep">
          {sorted.map(p => {
            const on = String(p.gplay_id) === String(gplayId);
            const mine = initialUser && p.user_name === initialUser;
            return (
              <label key={p.gplay_id}
                className={`flex items-center gap-3 px-3 py-2 text-sm transition ${p.call_enable ? 'cursor-pointer hover:bg-bg-hover' : 'cursor-not-allowed opacity-50'} ${on || mine ? 'bg-primary/10' : ''}`}>
                <input type="radio" name="promoGplay" className="accent-primary" checked={on} disabled={!p.call_enable}
                  onChange={() => setGplayId(String(p.gplay_id))} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-text-1">{p.user_name}</span>
                  <span className="block truncate text-xs text-text-3">{p.game_name} · {p.provider_name}</span>
                </span>
                <span className="shrink-0 text-right font-mono text-[11px] tabular-nums text-text-3">
                  {p.call_enable ? `#${p.gplay_id}` : t('admin.casinoPromo.callNotAvailable')}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>{t('admin.casinoPromo.amountLabel')}</label>
          <input type="number" min={callMin || 0} max={MAX_SET_POINT} value={amount}
            onChange={e => setAmount(e.target.value)} placeholder={callMin ? String(callMin) : '0'} className={input} />
        </div>
        <div>
          <label className={label}>{t('admin.casinoPromo.memoLabel')}</label>
          <input value={memo} maxLength={200} onChange={e => setMemo(e.target.value)} className={input} />
        </div>
      </div>

      {balanceLow && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-bold text-warning">
          {t('admin.casinoPromo.balanceWarning')}
        </div>
      )}

      <ConfirmButton
        icon="play_arrow"
        label={busy ? t('common.saving') : t('admin.casinoPromo.startBonus')}
        confirmLabel={t('admin.casinoPromo.confirm')}
        confirmText={selected ? t('admin.casinoPromo.confirmBonus', { user: selected.user_name, game: selected.game_name, amount: formatMoney(n) }) : ''}
        onConfirm={submit}
        disabled={busy || !selected || !valid}
        className={ADMIN_BTN_PRIMARY}
      />
      <p className="mt-2 text-[11px] text-text-3">{t('admin.casinoPromo.bonusHint')}</p>
    </div>
  );
}
