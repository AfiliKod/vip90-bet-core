import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

/**
 * O1 — VIP/seviye programı.
 *
 * services/vip.js zaten tam yazılmıştı (awardXp, getVipStatus, level CRUD)
 * — eksik olan admin arayüzüydü. XP artık her casino turunda (CasinoRound
 * post-save hook) ve her sonuçlanan spor bahsinde (settlement.js) veriliyor.
 */
export default function AdminVip() {
  const { t } = useTranslation();
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);

  function load() {
    setError('');
    api.get('/admin/vip-levels')
      .then(r => setLevels(r.data.levels))
      .catch(() => setError(t('admin.vip.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openEdit(level) {
    setForm({ ...level });
  }

  function openCreate() {
    const nextLevel = (levels.reduce((max, l) => Math.max(max, l.level), 0)) + 1;
    setForm({
      level: nextLevel, name: '', xpRequired: 0, cashbackPercent: 0,
      rewardAmount: 0, rewardType: 'balance', color: '#6b7280', icon: '★',
    });
  }

  async function save() {
    setError('');
    try {
      await api.post('/admin/vip-levels', {
        level: Number(form.level),
        name: form.name,
        xpRequired: Number(form.xpRequired),
        cashbackPercent: Number(form.cashbackPercent),
        rewardAmount: Number(form.rewardAmount),
        rewardType: form.rewardType,
        color: form.color,
        icon: form.icon,
      });
      setForm(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.vip.saveError'));
    }
  }

  async function remove(level) {
    setError('');
    try {
      await api.delete(`/admin/vip-levels/${level}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.vip.deleteError'));
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">{t('admin.vip.title')}</h1>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">
          {t('admin.vip.newLevel')}
        </button>
      </div>
      <p className="text-text-3 text-sm mb-6">{t('admin.vip.subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-text-3">{t('admin.vip.loading')}</div>
      ) : (
        <div className="space-y-3">
          {levels.map(l => (
            <div key={l._id} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span style={{ color: l.color }}>{l.icon}</span> {l.name}
                  <span className="text-xs text-text-3 font-normal">({t('admin.vip.levelLabel', { n: l.level })})</span>
                </div>
                <div className="text-xs text-text-3 mt-0.5">
                  {t('admin.vip.xpRequired', { xp: l.xpRequired.toLocaleString() })} · {t('admin.vip.cashback', { pct: l.cashbackPercent })} · {t('admin.vip.reward', { amount: l.rewardAmount, type: l.rewardType })}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(l)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                  {t('common.edit')}
                </button>
                <button onClick={() => remove(l.level)} className="px-3 py-1.5 rounded-lg text-xs border border-red-500/20 text-red-300 hover:bg-red-500/10">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">{t('admin.vip.editLevel')}</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-xs text-text-3">
                {t('admin.vip.levelField')}
                <input type="number" min="1" value={form.level}
                  onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.nameField')}
                <input value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.xpField')}
                <input type="number" min="0" value={form.xpRequired}
                  onChange={e => setForm(f => ({ ...f, xpRequired: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.cashbackField')}
                <input type="number" min="0" max="100" step="0.5" value={form.cashbackPercent}
                  onChange={e => setForm(f => ({ ...f, cashbackPercent: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.rewardAmountField')}
                <input type="number" min="0" value={form.rewardAmount}
                  onChange={e => setForm(f => ({ ...f, rewardAmount: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.iconField')}
                <input value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">{t('common.save')}</button>
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-white/10 text-text-2 text-sm">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
