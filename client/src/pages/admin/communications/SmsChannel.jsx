// client/src/pages/admin/communications/SmsChannel.jsx
//
// İletişim → SMS: şablonlar / gönderim günlüğü / test.
// Sağlayıcı + gönderici ayarları 2026-10-06'da Modules → SMS Gateway
// kartına taşındı (tek `section="all"` gövde); bu sayfa artık yalnız
// gönderim işlerini taşır. Şablonlar mevcut `SmsTemplates.jsx` gövdesinin
// `embedded` hâliyle açılır. `?sub=provider|sender` gibi eski yer imleri
// `normalizeSub` ile sessizce şablonlara düşer.
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import { AdminTabs } from '../../../components/admin/AdminPageHeader.jsx';
import { SUB_TABS, normalizeSub } from './communicationsLogic.js';

const SmsTemplates = lazy(() => import('../SmsTemplates.jsx'));
const DeliveryLogsPanel = lazy(() => import('./DeliveryLogsPanel.jsx'));
const TestSendPanel = lazy(() => import('./TestSendPanel.jsx'));

const CARD = 'rounded-xl border border-white/10 bg-bg-card p-4';

export default function SmsChannel() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const sub = normalizeSub('sms', params.get('sub'));
  const setSub = (key) => setParams({ channel: 'sms', sub: key });

  const fallback = (
    <div className={`${CARD} py-12 text-center`}>
      <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
      <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
    </div>
  );

  return (
    <div>
      <AdminTabs
        items={SUB_TABS.sms.map(key => ({ key, label: t(`admin.communications.sms.${key}`) }))}
        value={sub}
        onChange={setSub}
      />

      <div role="tabpanel" className="mt-4">
        {sub === 'templates' && <Suspense fallback={fallback}><SmsTemplates embedded /></Suspense>}
        {sub === 'logs' && <Suspense fallback={fallback}><DeliveryLogsPanel channel="sms" /></Suspense>}
        {sub === 'test' && <Suspense fallback={fallback}><TestSendPanel channel="sms" /></Suspense>}
      </div>
    </div>
  );
}
