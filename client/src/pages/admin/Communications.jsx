// client/src/pages/admin/Communications.jsx
//
// Tek iletişim yüzeyi — e-posta + SMS (+ kampanya/otomasyon/segment) aynı
// sayfada. Push Notifications eklendiğinde yeni bir `channel` girdisi olarak
// buraya katılır (bkz. docs/communications.md).
//
// Desen: `Platform.jsx` (tab bar + lazy import + useSearchParams). Kanal
// sekmeleri `?channel=`, kanal içi alt sekmeler `?sub=` ile taşınır — eski
// yer imleri (`/admin/mail-templates`) App.jsx'te buraya yönlendirilir.
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';
import { CHANNELS, normalizeChannel } from './communications/communicationsLogic.js';

const EmailChannel = lazy(() => import('./communications/EmailChannel.jsx'));
const SmsChannel = lazy(() => import('./communications/SmsChannel.jsx'));
const CampaignsPanel = lazy(() => import('./communications/CampaignsPanel.jsx'));
const AutomationsPanel = lazy(() => import('./communications/AutomationsPanel.jsx'));
const SegmentsPanel = lazy(() => import('./communications/SegmentsPanel.jsx'));

/** Kanal başına sekme etiketi + sekme altındaki bağlam cümlesi. */
const CHANNEL_META = {
  email: { labelKey: 'admin.communications.channelEmail', descKey: 'admin.communications.channelEmailDesc' },
  sms: { labelKey: 'admin.communications.channelSms', descKey: 'admin.communications.channelSmsDesc' },
  campaigns: { labelKey: 'admin.communications.channelCampaigns', descKey: 'admin.communications.channelCampaignsDesc' },
  automations: { labelKey: 'admin.communications.channelAutomations', descKey: 'admin.communications.channelAutomationsDesc' },
  segments: { labelKey: 'admin.communications.channelSegments', descKey: 'admin.communications.channelSegmentsDesc' },
};

export default function AdminCommunications() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const channel = normalizeChannel(params.get('channel'));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.communications.title') }]}
        title={t('admin.communications.title')}
        sub={t('admin.communications.pageDesc')}
      >
        <AdminTabs
          items={CHANNELS.map(key => ({ key, label: t(CHANNEL_META[key].labelKey) }))}
          value={channel}
          // Kanal değişince `sub` bilinçli olarak atılır: her kanalın kendi
          // varsayılan alt sekmesi normalizeSub tarafından çözülür.
          onChange={key => setParams({ channel: key })}
        />
      </AdminPageHeader>

      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-text-3">
        {t(CHANNEL_META[channel].descKey)}
      </p>

      <div role="tabpanel" aria-label={t(CHANNEL_META[channel].labelKey)}>
        <Suspense fallback={(
          <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
            <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
            <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
          </div>
        )}>
          {channel === 'email' && <EmailChannel />}
          {channel === 'sms' && <SmsChannel />}
          {channel === 'campaigns' && <CampaignsPanel />}
          {channel === 'automations' && <AutomationsPanel />}
          {channel === 'segments' && <SegmentsPanel />}
        </Suspense>
      </div>
    </div>
  );
}
