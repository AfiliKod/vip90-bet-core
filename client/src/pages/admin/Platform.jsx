// client/src/pages/admin/Platform.jsx
//
// Settings + Modules için ortak orkestratör (Faz 4.3). Compliance.jsx'in
// aynı pattern'i: tab bar + lazy import + useSearchParams.
// Currencies/Jurisdictions/Brands `embedded` prop'uyla gömülür (2026-10-02).
// Alt-sayfaların kendi <h1>/dış max-w wrapper'ları kaldırıldı, buranın
// max-w wrapper'ı baskın.
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';

const AdminSettings = lazy(() => import('./Settings.jsx'));
const AdminModules = lazy(() => import('./Modules.jsx'));
const AdminCurrencies = lazy(() => import('./Currencies.jsx'));
const AdminJurisdictions = lazy(() => import('./Jurisdictions.jsx'));
const AdminBrands = lazy(() => import('./Brands.jsx'));
const AdminSeo = lazy(() => import('./SeoSettings.jsx'));

const TABS = [
  { key: 'settings', labelKey: 'admin.platform.tabGeneral' },
  { key: 'modules', labelKey: 'admin.nav.modules' },
  { key: 'currencies', labelKey: 'admin.nav.currencies' },
  { key: 'jurisdictions', labelKey: 'admin.nav.jurisdictions' },
  { key: 'brands', labelKey: 'admin.nav.brands' },
  { key: 'seo', labelKey: 'admin.platform.tabSeo' },
];

// Sekme başına kısa bağlam cümlesi (eskiden ayrı "bağlam kartı" vardı;
// aktif sekme etiketi hem h3'te hem rozet olarak iki kez yazılıyordu).
const TAB_META = {
  settings: { descKey: 'admin.platform.tabSettingsDesc' },
  modules: { descKey: 'admin.platform.tabModulesDesc' },
  currencies: { descKey: 'admin.platform.tabCurrenciesDesc' },
  jurisdictions: { descKey: 'admin.platform.tabJurisdictionsDesc' },
  brands: { descKey: 'admin.platform.tabBrandsDesc' },
  seo: { descKey: 'admin.platform.tabSeoDesc' },
};

export default function AdminPlatform() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'settings';
  const tab = TABS.some(x => x.key === rawTab) ? rawTab : 'settings';
  const active = TABS.find(x => x.key === tab);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupPlatform') }, { label: t('admin.platform.pageTitle') }]}
        title={t('admin.platform.pageTitle')}
        sub={t('admin.platform.pageDesc')}
      >
        <AdminTabs
          items={TABS.map(x => ({ key: x.key, label: t(x.labelKey) }))}
          value={tab}
          onChange={key => setParams({ tab: key })}
        />
      </AdminPageHeader>

      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-text-3">
        {t(TAB_META[tab].descKey)}
      </p>

      <div role="tabpanel" aria-label={t(active.labelKey)}>
        <Suspense fallback={(
          <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
            <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
            <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
          </div>
        )}>
          {tab === 'settings' && <AdminSettings />}
          {tab === 'modules' && <AdminModules />}
          {tab === 'currencies' && <AdminCurrencies embedded />}
          {tab === 'jurisdictions' && <AdminJurisdictions embedded />}
          {tab === 'brands' && <AdminBrands embedded />}
          {tab === 'seo' && <AdminSeo />}
        </Suspense>
      </div>
    </div>
  );
}
