// client/src/pages/admin/Compliance.jsx
//
// KYC review + Risk & Fraud + Reconciliation + Responsible Gaming'i tek
// sayfada tab'larla birleştiren orkestratör. Mevcut sayfa component'leri
// TAŞINMADI, değiştirilmedi — sadece burada seçili tab'a göre render ediliyor.
// Settings tab'ı kaldırıldı (2026-09-23): KycSettings.jsx'in işlevi Modules.jsx'in
// KycSettingsBody bölümünde zaten vardı (KYC on/off + provider + Sumsub key).
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';

const AdminKycReview = lazy(() => import('./KycReview.jsx'));
const AdminRiskDashboard = lazy(() => import('./RiskDashboard.jsx'));
const AdminReconciliation = lazy(() => import('./Reconciliation.jsx'));
const AdminResponsibleGaming = lazy(() => import('./ResponsibleGamingAdmin.jsx'));

const TABS = [
  { key: 'kyc', labelKey: 'admin.compliance.tabKyc' },
  { key: 'risk', labelKey: 'admin.compliance.tabRisk' },
  { key: 'reconciliation', labelKey: 'admin.compliance.tabReconciliation' },
  { key: 'rg', labelKey: 'admin.compliance.tabRg' },
];

// Sekme başına kısa bağlam cümlesi. Eskiden ayrı bir "bağlam kartı" vardı ve
// aktif sekme etiketini hem h3'te hem rozet olarak İKİ KEZ yazıyordu — aynı
// metin iki yerde, ayrıca kart tabloyu aşağı itiyordu. Etiket AdminTabs'ta
// zaten var; burada sadece bir cümle bilgi kalıyor (Wallet/Platform/
// Personalization ile aynı karar).
const TAB_META = {
  kyc: { descKey: 'admin.compliance.tabKycDesc' },
  risk: { descKey: 'admin.compliance.tabRiskDesc' },
  reconciliation: { descKey: 'admin.compliance.tabReconciliationDesc' },
  rg: { descKey: 'admin.compliance.tabRgDesc' },
};

export default function AdminCompliance() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'kyc';
  // Eski ?tab=settings bookmark'ları artık settings tab'ı olmadığı için
  // kyc'e düşer (eski path'ler silinmez, redirect kuralına uyar).
  const tab = TABS.some(x => x.key === rawTab) ? rawTab : 'kyc';
  const active = TABS.find(x => x.key === tab);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupCompliance') }, { label: t('admin.compliance.pageTitle') }]}
        title={t('admin.compliance.pageTitle')}
        sub={t('admin.compliance.pageDesc')}
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
          {tab === 'kyc' && <AdminKycReview />}
          {tab === 'risk' && <AdminRiskDashboard />}
          {tab === 'reconciliation' && <AdminReconciliation />}
          {tab === 'rg' && <AdminResponsibleGaming />}
        </Suspense>
      </div>
    </div>
  );
}
