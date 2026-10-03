import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useTranslation } from '../i18n';
import { useToastStore } from '../store/toastStore';

export default function ResponsibleGaming() {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.add);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [limitForm, setLimitForm] = useState({ deposit: '', loss: '', wager: '' });
  const [saving, setSaving] = useState(false);
  const [coolOffDuration, setCoolOffDuration] = useState(24);
  const [exclusionDays, setExclusionDays] = useState(30);
  const [limitPeriod, setLimitPeriod] = useState('daily');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/responsible-gaming/me/status');
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveLimit(type) {
    const amount = parseFloat(limitForm[type]);
    if (isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      await api.put(`/responsible-gaming/me/limits/${type}`, { amount, limitType: limitPeriod });
      toast(amount === 0 ? t('rg.limitRemoved') : t('rg.limitSaved'), 'success');
      await load();
    } catch (e) {
      toast(e.response?.data?.error?.message || t('rg.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function activateCoolOff() {
    if (!confirm(t('rg.coolOffConfirm'))) return;
    setSaving(true);
    try {
      await api.post('/responsible-gaming/me/cool-off', { duration: Number(coolOffDuration) });
      toast(t('rg.coolOffActivated'), 'success');
      await load();
    } catch (e) {
      toast(e.response?.data?.error?.message || t('rg.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function activateSelfExclusion() {
    if (!confirm(t('rg.selfExclusionConfirm'))) return;
    setSaving(true);
    try {
      const until = new Date(Date.now() + Number(exclusionDays) * 24 * 60 * 60 * 1000).toISOString();
      await api.post('/responsible-gaming/me/self-exclusion', { until });
      toast(t('rg.selfExclusionActivated'), 'success');
      await load();
    } catch (e) {
      toast(e.response?.data?.error?.message || t('rg.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-text-2">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      <h1 className="text-2xl font-bold text-text-1">{t('rg.title')}</h1>

      {status?.isRestricted && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          {t('rg.accountRestricted')}: {status.restrictionReason}
        </div>
      )}
      {status?.isCoolingOff && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-400 text-sm">
          {t('rg.currentlyCoolingOff')}
        </div>
      )}
      {status?.isSelfExcluded && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          {t('rg.currentlySelfExcluded')}
        </div>
      )}

      <section className="bg-bg-card border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-text-1">{t('rg.dailyLimits')}</h2>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-text-3">{t('rg.limitPeriod')}</label>
          <select value={limitPeriod} onChange={(e) => setLimitPeriod(e.target.value)} className="bg-bg-deep/40 border border-white/10 rounded-lg px-2 py-1 text-text-1 text-sm">
            <option value="daily">{t('rg.limitType.daily')}</option>
            <option value="weekly">{t('rg.limitType.weekly')}</option>
            <option value="monthly">{t('rg.limitType.monthly')}</option>
          </select>
        </div>
        {['deposit', 'loss', 'wager'].map((type) => (
          <div key={type} className="flex items-center gap-3">
            <label className="text-sm text-text-2 w-32">{t(`rg.limit.${type}`)}</label>
            <input
              type="number" min="0"
              value={limitForm[type]}
              onChange={(e) => setLimitForm((f) => ({ ...f, [type]: e.target.value }))}
              placeholder={status?.limits?.[`${type}${limitPeriod.charAt(0).toUpperCase() + limitPeriod.slice(1)}`] ? String(status.limits[`${type}${limitPeriod.charAt(0).toUpperCase() + limitPeriod.slice(1)}`]) : t('rg.noLimit')}
              className="flex-1 bg-bg-deep/40 border border-white/10 rounded-xl px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50"
            />
            <button disabled={saving} onClick={() => saveLimit(type)} className="px-4 py-2 rounded-lg bg-primary text-bg-deep font-semibold text-sm disabled:opacity-50">
              {t('common.save')}
            </button>
          </div>
        ))}
      </section>

      <section className="bg-bg-card border border-white/10 rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-text-1">{t('rg.coolOff')}</h2>
        <p className="text-sm text-text-3">{t('rg.coolOffDescription')}</p>
        <div className="flex items-center gap-3">
          <select value={coolOffDuration} onChange={(e) => setCoolOffDuration(e.target.value)} className="bg-bg-deep/40 border border-white/10 rounded-xl px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50">
            <option value={24}>{t('rg.hours24')}</option>
            <option value={168}>{t('rg.days7')}</option>
            <option value={720}>{t('rg.days30')}</option>
          </select>
          <button disabled={saving} onClick={activateCoolOff} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50">
            {t('rg.activateCoolOff')}
          </button>
        </div>
      </section>

      <section className="bg-bg-card border border-red-500/20 rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-red-400">{t('rg.selfExclusion')}</h2>
        <p className="text-sm text-text-3">{t('rg.selfExclusionDescription')}</p>
        <div className="flex items-center gap-3">
          <select value={exclusionDays} onChange={(e) => setExclusionDays(e.target.value)} className="bg-bg-deep/40 border border-white/10 rounded-xl px-3 py-2 text-text-1 text-sm focus:outline-none focus:border-accent/50">
            <option value={30}>{t('rg.days30')}</option>
            <option value={90}>{t('rg.days90')}</option>
            <option value={365}>{t('rg.days365')}</option>
          </select>
          <button disabled={saving} onClick={activateSelfExclusion} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50">
            {t('rg.activateSelfExclusion')}
          </button>
        </div>
      </section>
    </div>
  );
}
