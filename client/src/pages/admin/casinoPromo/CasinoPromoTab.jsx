import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { formatMoney } from '../../../utils/money';
import BonusCallForm from './BonusCallForm.jsx';
import FreeRoundForm from './FreeRoundForm.jsx';
import GrantsTable from './GrantsTable.jsx';
import { promoErrorMessage } from './promoErrors.js';

function Card({ title, children }) {
  return (
    <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
      <h3 className="mb-4 text-sm font-extrabold text-text-1">{title}</h3>
      {children}
    </section>
  );
}

export default function CasinoPromoTab({ initialUser = null }) {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [mode, setMode] = useState(initialUser ? 'freeround' : 'bonus');
  const [config, setConfig] = useState(null);
  const [plays, setPlays] = useState([]);
  const [playsLoading, setPlaysLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.get('/admin/igames/promo/config').then(r => setConfig(r.data)).catch(() => setConfig(null));
  }, []);

  const loadPlays = useCallback(async () => {
    setPlaysLoading(true);
    try {
      const { data } = await api.get('/admin/igames/online-plays');
      setPlays(data.plays || []);
    } catch (e) {
      addToast(promoErrorMessage(e, t), 'error');
    } finally {
      setPlaysLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => { loadPlays(); }, [loadPlays]);

  const bump = useCallback(() => setRefreshKey(k => k + 1), []);
  const seg = (on) => `h-9 flex-1 rounded-lg text-[13px] font-bold transition ${on ? 'bg-primary text-black' : 'bg-bg-deep text-text-2 hover:text-text-1'}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-text-2">
          {t('admin.casinoPromo.agentBalance')}: <span className="font-mono tabular-nums text-text-1">
            {config?.agentBalance != null ? `${formatMoney(config.agentBalance)}${config.agentCurrency ? ` (${config.agentCurrency})` : ''}` : '—'}
          </span>
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-text-2">
          {t('admin.casinoPromo.callMin')}: <span className="font-mono tabular-nums text-text-1">{config?.callMin ?? '—'}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t('admin.casinoPromo.giveTitle')}>
          <div className="mb-4 flex gap-2" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'bonus'} onClick={() => setMode('bonus')} className={seg(mode === 'bonus')}>
              {t('admin.casinoPromo.segBonus')}
            </button>
            <button type="button" role="tab" aria-selected={mode === 'freeround'} onClick={() => setMode('freeround')} className={seg(mode === 'freeround')}>
              {t('admin.casinoPromo.segFreeround')}
            </button>
          </div>
          {mode === 'bonus'
            ? <BonusCallForm plays={plays} playsLoading={playsLoading} onRefresh={loadPlays} config={config} initialUser={initialUser} onDone={bump} />
            : <FreeRoundForm initialUser={initialUser} onDone={bump} />}
        </Card>
        <Card title={t('admin.casinoPromo.historyTitle')}>
          <GrantsTable initialUser={initialUser} refreshKey={refreshKey} />
        </Card>
      </div>
    </div>
  );
}
