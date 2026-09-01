import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useModuleStore } from '../../store/moduleStore';

/**
 * P3 — bot oyuncular. Botlar ayrı bir koleksiyon değil, User
 * koleksiyonunda isBot:true bayraklı gerçek hesaplardır — bu sayede
 * mevcut TÜM oyun route'larını (Dice/Limbo/Plinko/...) kendi gerçek
 * matematikleriyle, hiçbir değişiklik yapılmadan kullanırlar.
 * jobs/botScheduler.js periyodik olarak aksiyonu hazır botları tetikler.
 */
export default function AdminBots() {
  const { t } = useTranslation();
  const [bots, setBots] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);

  // Son Kazananlar simülasyonu — P3'ün gerçek User/bakiye mimarisinden
  // AYRI, kozmetik bir sistem (services/fakeWinners.js). Gerçek User kaydı,
  // gerçek bahis ya da gerçek bakiye değişimi yok.
  const [fw, setFw] = useState(null);
  const [fwPoolSize, setFwPoolSize] = useState(0);
  const [fwSaving, setFwSaving] = useState(false);
  const [fwError, setFwError] = useState('');
  const modulesAvailable = useModuleStore(s => s.available);

  function loadFakeWinners() {
    api.get('/admin/fake-winners')
      .then(r => { setFw(r.data.config); setFwPoolSize(r.data.poolSize); })
      .catch(() => setFwError(t('admin.fakeWinners.loadError')));
  }

  async function saveFakeWinners(updates) {
    setFwError('');
    setFwSaving(true);
    try {
      const r = await api.put('/admin/fake-winners', updates);
      setFw(r.data.config);
      setFwPoolSize(r.data.poolSize);
    } catch (e) {
      setFwError(e.response?.data?.error?.message || t('admin.fakeWinners.saveError'));
    } finally {
      setFwSaving(false);
    }
  }

  function load() {
    setError('');
    api.get('/admin/bots', { params: { limit: 100 } })
      .then(r => { setBots(r.data.bots); setTotal(r.data.total); })
      .catch(() => setError(t('admin.bots.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(loadFakeWinners, []);

  function openCreate() {
    setForm({ username: '', email: '', botType: 'casual', notes: '' });
  }

  async function create() {
    setError('');
    try {
      await api.post('/admin/bots', {
        username: form.username, email: form.email,
        botType: form.botType, notes: form.notes,
      });
      setForm(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.bots.saveError'));
    }
  }

  async function toggleActive(bot) {
    setError('');
    try {
      await api.patch(`/admin/bots/${bot._id}`, { isActive: !bot.isActive });
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.bots.saveError'));
    }
  }

  async function remove(bot) {
    setError('');
    try {
      await api.delete(`/admin/bots/${bot._id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.bots.deleteError'));
    }
  }

  async function startAll() {
    setError('');
    try { await api.post('/admin/bots/start-all'); load(); }
    catch (e) { setError(e.response?.data?.error?.message || t('admin.bots.saveError')); }
  }

  async function stopAll() {
    setError('');
    try { await api.post('/admin/bots/stop-all'); load(); }
    catch (e) { setError(e.response?.data?.error?.message || t('admin.bots.saveError')); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-bg-card border border-white/10 rounded-xl p-5 mb-8">
        <h2 className="text-lg font-bold mb-1">{t('admin.fakeWinners.title')}</h2>
        <p className="text-text-3 text-sm mb-4">{t('admin.fakeWinners.subtitle')}</p>
        {fwError && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{fwError}</div>
        )}
        {!fw ? (
          <div className="text-text-3 text-sm">{t('admin.bots.loading')}</div>
        ) : (
          <>
            <label className="flex items-center gap-2 mb-4 text-sm">
              <input
                type="checkbox"
                checked={fw.enabled}
                onChange={e => saveFakeWinners({ enabled: e.target.checked })}
              />
              {t('admin.fakeWinners.enabled')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.poolMin')}
                <input type="number" defaultValue={fw.poolMin} min="1"
                  onBlur={e => saveFakeWinners({ poolMin: Number(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.poolMax')}
                <input type="number" defaultValue={fw.poolMax} min="1"
                  onBlur={e => saveFakeWinners({ poolMax: Number(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.currentPool')}
                <div className="mt-1 h-9 rounded-lg bg-bg-base border border-white/5 px-3 text-sm text-text-2 flex items-center">{fwPoolSize}</div>
              </label>
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.intervalMin')}
                <input type="number" defaultValue={fw.intervalMinMs} min="1000" step="1000"
                  onBlur={e => saveFakeWinners({ intervalMinMs: Number(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.intervalMax')}
                <input type="number" defaultValue={fw.intervalMaxMs} min="1000" step="1000"
                  onBlur={e => saveFakeWinners({ intervalMaxMs: Number(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.amountMin')}
                <input type="number" defaultValue={fw.amountMin} min="1"
                  onBlur={e => saveFakeWinners({ amountMin: Number(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.fakeWinners.amountMax')}
                <input type="number" defaultValue={fw.amountMax} min="1"
                  onBlur={e => saveFakeWinners({ amountMax: Number(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
            </div>

            <div className="border-t border-white/10 pt-3 mt-1">
              <p className="text-xs font-semibold text-text-2 mb-2">{t('admin.fakeWinners.areasTitle')}</p>
              <label className="flex items-center gap-2 mb-2 text-sm text-text-3">
                <input type="checkbox" checked disabled />
                {t('admin.fakeWinners.areaCore')}
              </label>
              <label className={`flex items-center gap-2 mb-2 text-sm ${modulesAvailable['casino-content'] === false ? 'text-text-3/50' : 'text-text-2'}`}>
                <input
                  type="checkbox"
                  checked={!!fw.includeCasinoWins}
                  disabled={modulesAvailable['casino-content'] === false}
                  onChange={e => saveFakeWinners({ includeCasinoWins: e.target.checked })}
                />
                {t('admin.fakeWinners.areaCasino')}
                {modulesAvailable['casino-content'] === false && (
                  <span className="text-[10px] text-text-3">({t('admin.fakeWinners.moduleDisabled')})</span>
                )}
              </label>
              <label className={`flex items-center gap-2 text-sm ${modulesAvailable['betting'] === false ? 'text-text-3/50' : 'text-text-2'}`}>
                <input
                  type="checkbox"
                  checked={!!fw.includeBettingWins}
                  disabled={modulesAvailable['betting'] === false}
                  onChange={e => saveFakeWinners({ includeBettingWins: e.target.checked })}
                />
                {t('admin.fakeWinners.areaBetting')}
                {modulesAvailable['betting'] === false && (
                  <span className="text-[10px] text-text-3">({t('admin.fakeWinners.moduleDisabled')})</span>
                )}
              </label>
            </div>

            {fwSaving && <div className="text-xs text-text-3 mt-3">{t('common.saving')}</div>}
          </>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">{t('admin.bots.title')}</h1>
        <div className="flex gap-2">
          <button onClick={startAll} className="px-3 py-2 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
            {t('admin.bots.startAll')}
          </button>
          <button onClick={stopAll} className="px-3 py-2 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
            {t('admin.bots.stopAll')}
          </button>
          <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">
            {t('admin.bots.newBot')}
          </button>
        </div>
      </div>
      <p className="text-text-3 text-sm mb-6">{t('admin.bots.subtitle')} ({total})</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-text-3">{t('admin.bots.loading')}</div>
      ) : (
        <div className="space-y-3">
          {bots.map(b => (
            <div key={b._id} className="bg-bg-card border border-white/10 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {b.username}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.isActive ? 'bg-green-500/15 text-green-300' : 'bg-white/5 text-text-3'}`}>
                    {b.isActive ? t('admin.bots.active') : t('admin.bots.inactive')}
                  </span>
                  <span className="text-xs text-text-3">{b.botProfile?.botType}</span>
                  <span className="text-xs text-text-3">· {b.botProfile?.currentState}</span>
                </div>
                <div className="text-xs text-text-3 mt-0.5">
                  {t('admin.bots.balance')}: {Number(b.balance || 0).toLocaleString()} · {t('admin.bots.bets')}: {b.botProfile?.stats?.totalBets ?? 0} · {t('admin.bots.wagered')}: {Number(b.botProfile?.stats?.totalWagered || 0).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleActive(b)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                  {b.isActive ? t('admin.bots.pause') : t('admin.bots.resume')}
                </button>
                <button onClick={() => remove(b)} className="px-3 py-1.5 rounded-lg text-xs border border-red-500/20 text-red-300 hover:bg-red-500/10">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
          {bots.length === 0 && <div className="text-text-3 text-sm">{t('admin.bots.empty')}</div>}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">{t('admin.bots.newBot')}</h2>
            <div className="grid grid-cols-1 gap-3 mb-4">
              <label className="text-xs text-text-3">
                {t('admin.bots.usernameField')}
                <input value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.bots.emailField')}
                <input value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.bots.typeField')}
                <select value={form.botType}
                  onChange={e => setForm(f => ({ ...f, botType: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1">
                  <option value="casual">casual</option>
                  <option value="aggressive">aggressive</option>
                  <option value="conservative">conservative</option>
                  <option value="high_roller">high_roller</option>
                  <option value="bonus_hunter">bonus_hunter</option>
                </select>
              </label>
              <label className="text-xs text-text-3">
                {t('admin.bots.notesField')}
                <input value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={create} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">{t('common.save')}</button>
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-white/10 text-text-2 text-sm">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
