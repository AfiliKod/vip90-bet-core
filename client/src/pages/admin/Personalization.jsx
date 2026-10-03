// client/src/pages/admin/Personalization.jsx
//
// Theme + Branding + Homepage Slider + Static Pages için ortak orkestratör
// (Faz 4.4). Compliance.jsx / Platform.jsx aynı pattern: tab bar + lazy +
// useSearchParams. Alt-sayfaların kendi <h1>/dış max-w wrapper'ları kaldırıldı.
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';

const AdminTheme = lazy(() => import('./Theme.jsx'));
const AdminBranding = lazy(() => import('./Branding.jsx'));
const AdminPages = lazy(() => import('./Pages.jsx'));
const AdminStaticPages = lazy(() => import('./StaticPages.jsx'));

const TABS = [
  { key: 'theme', labelKey: 'admin.nav.theme' },
  { key: 'branding', labelKey: 'admin.nav.branding' },
  { key: 'pages', labelKey: 'admin.nav.homepageSlider' },
  { key: 'staticPages', labelKey: 'admin.nav.staticPages' },
];

// Sekme başına kısa bağlam cümlesi (eskiden ayrı "bağlam kartı" vardı;
// aktif sekme etiketi hem h3'te hem rozet olarak iki kez yazılıyordu).
const TAB_META = {
  theme: { descKey: 'admin.personalization.tabThemeDesc' },
  branding: { descKey: 'admin.personalization.tabBrandingDesc' },
  pages: { descKey: 'admin.personalization.tabPagesDesc' },
  staticPages: { descKey: 'admin.personalization.tabStaticPagesDesc' },
};

export default function AdminPersonalization() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'theme';
  const tab = TABS.some(x => x.key === rawTab) ? rawTab : 'theme';
  const active = TABS.find(x => x.key === tab);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupPlatform') }, { label: t('admin.personalization.pageTitle') }]}
        title={t('admin.personalization.pageTitle')}
        sub={t('admin.personalization.pageDesc')}
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
          {tab === 'theme' && <AdminTheme />}
          {tab === 'branding' && <AdminBranding />}
          {tab === 'pages' && <AdminPages />}
          {tab === 'staticPages' && <AdminStaticPages />}
        </Suspense>
      </div>
    </div>
  );
}
