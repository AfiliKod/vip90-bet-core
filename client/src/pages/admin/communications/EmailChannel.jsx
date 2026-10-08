// client/src/pages/admin/communications/EmailChannel.jsx
//
// İletişim → E-posta: şablonlar / gönderen kimlikleri / günlüğ / test.
// Sağlayıcı ayarları 2026-10-06'da Modules → Email Gateway kartına
// taşındı; bu sayfa artık yalnız gönderim işlerini taşır. Şablon ve günlük
// içerikleri mevcut `MailTemplates.jsx` gövdesinin `embedded` hâliyle açılır
// (kod tekrarı yok). `?sub=provider` gibi eski yer imleri `normalizeSub`
// ile sessizce şablonlara düşer.
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import { AdminTabs } from '../../../components/admin/AdminPageHeader.jsx';
import { SUB_TABS, normalizeSub } from './communicationsLogic.js';

const MailTemplates = lazy(() => import('../MailTemplates.jsx'));
const SenderIdentitiesPanel = lazy(() => import('./SenderIdentitiesPanel.jsx'));
const DeliveryLogsPanel = lazy(() => import('./DeliveryLogsPanel.jsx'));
const TestSendPanel = lazy(() => import('./TestSendPanel.jsx'));

const CARD = 'rounded-xl border border-white/10 bg-bg-card p-4';

export default function EmailChannel() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const sub = normalizeSub('email', params.get('sub'));
  const setSub = (key) => setParams({ channel: 'email', sub: key });

  const fallback = (
    <div className={`${CARD} py-12 text-center`}>
      <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
      <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
    </div>
  );

  return (
    <div>
      <AdminTabs
        items={SUB_TABS.email.map(key => ({ key, label: t(`admin.communications.email.${key}`) }))}
        value={sub}
        onChange={setSub}
      />

      <div role="tabpanel" className="mt-4">
        {sub === 'templates' && <Suspense fallback={fallback}><MailTemplates embedded /></Suspense>}
        {sub === 'identities' && <Suspense fallback={fallback}><SenderIdentitiesPanel channel="email" /></Suspense>}
        {sub === 'logs' && <Suspense fallback={fallback}><DeliveryLogsPanel channel="email" /></Suspense>}
        {sub === 'test' && <Suspense fallback={fallback}><TestSendPanel channel="email" /></Suspense>}
      </div>
    </div>
  );
}
