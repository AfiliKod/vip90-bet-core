import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useModuleStore } from '../../store/moduleStore';

/**
 * Son Kazananlar Simülasyonu — kozmetik bir sistem (services/fakeWinners.js).
 * Gerçek User kaydı, gerçek bahis ya da gerçek bakiye değişimi yok.
 *
 * Bu sayfa eskiden "Bot Oyuncular" (P3'ün isBot:true bayraklı GERÇEK User
 * hesapları, jobs/botScheduler.js tarafından tetiklenen) yönetimini de
 * içeriyordu — kullanıcı kararıyla o bölüm buradan kaldırıldı: kozmetik
 * "Son Kazananlar" akışının yanında gerçek-hesaplı botların ayrı bir
 * yönetim UI'ı kafa karıştırıcıydı ve sitedeki "çevrimiçi kullanıcı"
 * sayısını YANSITMIYORDU (yalnızca birkaç gerçek bot kaydı var). Backend
 * tarafında P3 mimarisi (services/bot.js, jobs/botScheduler.js) dokunulmadan
 * duruyor — yalnızca bu admin sayfasındaki yönetim yüzeyi kaldırıldı.
 */
export default function AdminBots() {
  const { t } = useTranslation();
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

  useEffect(loadFakeWinners, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t('admin.fakeWinners.title')}</h1>
      <p className="text-text-3 text-sm mb-6">{t('admin.fakeWinners.subtitle')}</p>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        {fwError && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{fwError}</div>
        )}
        {!fw ? (
          <div className="text-text-3 text-sm">{t('common.loading')}</div>
        ) : (
          <>
            <label className="flex items-center gap-2 mb-5 text-sm">
              <input
                type="checkbox"
                checked={fw.enabled}
                onChange={e => saveFakeWinners({ enabled: e.target.checked })}
              />
              {t('admin.fakeWinners.enabled')}
            </label>

            <div className="mb-5">
              <p className="text-sm font-semibold text-text-1 mb-1">{t('admin.fakeWinners.poolTitle')}</p>
              <p className="text-xs text-text-3 mb-3">{t('admin.fakeWinners.poolExplain')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
              </div>
            </div>

            <div className="mb-5">
              <p className="text-sm font-semibold text-text-1 mb-1">{t('admin.fakeWinners.timingTitle')}</p>
              <p className="text-xs text-text-3 mb-3">{t('admin.fakeWinners.timingExplain')}</p>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
            </div>

            <div className="mb-5">
              <p className="text-sm font-semibold text-text-1 mb-1">{t('admin.fakeWinners.amountTitle')}</p>
              <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="border-t border-white/10 pt-4">
              <p className="text-sm font-semibold text-text-1 mb-1">{t('admin.fakeWinners.areasTitle')}</p>
              <p className="text-xs text-text-3 mb-3">{t('admin.fakeWinners.areasExplain')}</p>
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

            {fwSaving && <div className="text-xs text-text-3 mt-4">{t('common.saving')}</div>}
          </>
        )}
      </div>
    </div>
  );
}
