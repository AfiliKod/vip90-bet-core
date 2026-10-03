import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';

const AdminBankRequests = lazy(() => import('./BankRequests.jsx'));
const AdminCrypto = lazy(() => import('./Crypto.jsx'));
const AdminSlikair = lazy(() => import('./SlikairPayments.jsx'));

const TABS = [
  { key: 'bank', labelKey: 'admin.wallet.tabBank' },
  { key: 'crypto', labelKey: 'admin.wallet.tabCrypto' },
  { key: 'slikair', labelKey: 'admin.wallet.tabSlikair' },
];

export default function AdminWallet() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'bank';
  const tab = TABS.some(x => x.key === rawTab) ? rawTab : 'bank';
  const active = TABS.find(x => x.key === tab);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupFinance') }, { label: t('admin.wallet.pageTitle') }]}
        title={t('admin.wallet.pageTitle')}
        sub={t('admin.wallet.pageDesc')}
      >
        <AdminTabs
          items={TABS.map(x => ({ key: x.key, label: t(x.labelKey) }))}
          value={tab}
          onChange={key => setParams({ tab: key })}
        />
      </AdminPageHeader>

      <div role="tabpanel" aria-label={t(active.labelKey)}>
        <Suspense fallback={(
          <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
            <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
            <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
          </div>
        )}>
          {tab === 'bank' && <AdminBankRequests />}
          {tab === 'crypto' && <AdminCrypto />}
          {tab === 'slikair' && <AdminSlikair />}
        </Suspense>
      </div>
    </div>
  );
}
