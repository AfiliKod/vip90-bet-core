import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx';
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
  const { t, locale } = useTranslation();
  const [fw, setFw] = useState(null);
  const [fwPoolSize, setFwPoolSize] = useState(0);
  const [fwSaving, setFwSaving] = useState(false);
  const [fwError, setFwError] = useState('');
  const modulesAvailable = useModuleStore(s => s.available);

  function loadFakeWinners() {
    api.get('/admin/fake-winners')
      .then(r => { setFw(r.data.config); setFwPoolSize(r.data.poolSize); setFwError(''); })
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupDemoSimulation') }, { label: t('admin.fakeWinners.title') }]}
        title={t('admin.fakeWinners.title')}
        sub={t('admin.fakeWinners.subtitle')}
      />

      {fwError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">{fwError}</div>
      )}

      {!fw ? (
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">{fwError ? 'cloud_off' : 'progress_activity'}</span>
          <div className="mt-2 text-sm text-text-3">{fwError ? t('common.noData') : t('common.loading')}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">group_work</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.fakeWinners.poolTitle')}</h3>
              <span className={`rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${fw.enabled ? 'bg-success/15 text-success' : 'bg-white/10 text-text-2'}`}>
                {fw.enabled ? t('common.active') : t('common.none')}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
                {fwPoolSize.toLocaleString(locale)}
              </span>
            </div>
            <p className="mb-3 text-xs text-text-3">{t('admin.fakeWinners.poolExplain')}</p>

            <label className="mb-4 flex items-center gap-2 text-sm text-text-2">
              <input
                type="checkbox"
                checked={fw.enabled}
                onChange={e => saveFakeWinners({ enabled: e.target.checked })}
                className="rounded"
              />
              {t('admin.fakeWinners.enabled')}
            </label>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.poolMin')}
                <input type="number" defaultValue={fw.poolMin} min="1"
                  onBlur={e => saveFakeWinners({ poolMin: Number(e.target.value) })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm text-text-1 tabular-nums focus:border-white/25 focus:outline-none" />
              </label>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.poolMax')}
                <input type="number" defaultValue={fw.poolMax} min="1"
                  onBlur={e => saveFakeWinners({ poolMax: Number(e.target.value) })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm text-text-1 tabular-nums focus:border-white/25 focus:outline-none" />
              </label>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.currentPool')}
                <div className="mt-1.5 flex h-9 items-center rounded-lg border border-white/10 bg-bg-deep px-3 font-mono text-sm font-bold tabular-nums text-text-1">
                  {fwPoolSize.toLocaleString(locale)}
                </div>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">schedule</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.fakeWinners.timingTitle')}</h3>
            </div>
            <p className="mb-3 text-xs text-text-3">{t('admin.fakeWinners.timingExplain')}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.intervalMin')}
                <input type="number" defaultValue={fw.intervalMinMs} min="1000" step="1000"
                  onBlur={e => saveFakeWinners({ intervalMinMs: Number(e.target.value) })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm text-text-1 tabular-nums focus:border-white/25 focus:outline-none" />
              </label>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.intervalMax')}
                <input type="number" defaultValue={fw.intervalMaxMs} min="1000" step="1000"
                  onBlur={e => saveFakeWinners({ intervalMaxMs: Number(e.target.value) })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm text-text-1 tabular-nums focus:border-white/25 focus:outline-none" />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">payments</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.fakeWinners.amountTitle')}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.amountMin')}
                <input type="number" defaultValue={fw.amountMin} min="1"
                  onBlur={e => saveFakeWinners({ amountMin: Number(e.target.value) })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm text-text-1 tabular-nums focus:border-white/25 focus:outline-none" />
              </label>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {t('admin.fakeWinners.amountMax')}
                <input type="number" defaultValue={fw.amountMax} min="1"
                  onBlur={e => saveFakeWinners({ amountMax: Number(e.target.value) })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm text-text-1 tabular-nums focus:border-white/25 focus:outline-none" />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">checklist</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.fakeWinners.areasTitle')}</h3>
            </div>
            <p className="mb-3 text-xs text-text-3">{t('admin.fakeWinners.areasExplain')}</p>
            <label className="mb-2 flex items-center gap-2 text-sm text-text-3">
              <input type="checkbox" checked disabled className="rounded" />
              {t('admin.fakeWinners.areaCore')}
            </label>
            <label className={`mb-2 flex items-center gap-2 text-sm ${modulesAvailable?.['casino-content'] === false ? 'text-text-3/50' : 'text-text-2'}`}>
              <input
                type="checkbox"
                checked={!!fw.includeCasinoWins}
                disabled={modulesAvailable?.['casino-content'] === false}
                onChange={e => saveFakeWinners({ includeCasinoWins: e.target.checked })}
                className="rounded"
              />
              {t('admin.fakeWinners.areaCasino')}
              {modulesAvailable?.['casino-content'] === false && (
                <span className="text-[10px] text-text-3">({t('admin.fakeWinners.moduleDisabled')})</span>
              )}
            </label>
            <label className={`flex items-center gap-2 text-sm ${modulesAvailable?.betting === false ? 'text-text-3/50' : 'text-text-2'}`}>
              <input
                type="checkbox"
                checked={!!fw.includeBettingWins}
                disabled={modulesAvailable?.betting === false}
                onChange={e => saveFakeWinners({ includeBettingWins: e.target.checked })}
                className="rounded"
              />
              {t('admin.fakeWinners.areaBetting')}
              {modulesAvailable?.betting === false && (
                <span className="text-[10px] text-text-3">({t('admin.fakeWinners.moduleDisabled')})</span>
              )}
            </label>
          </section>

          {fwSaving && (
            <div className="flex items-center gap-2 text-xs text-text-3">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">progress_activity</span>
              {t('common.saving')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
