// client/src/pages/admin/communications/SenderIdentitiesPanel.jsx
//
// İletişim → E-posta → Sender identities: hangi kimlikle (görünen ad +
// adres) ve hangi sağlayıcı üzerinden mail gittiğinin salt-okunur özeti.
// Düzenleme Provider sekmesindedir — bu panel yalnızca "şimdi neyle
// gönderiliyor" sorusunu tek bakışta cevaplar ve oraya götürür.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { ADMIN_BTN } from '../../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell } from '../../../components/admin/AdminTable.jsx';
import { identityRows } from './communicationsLogic.js';

const SOURCE_CLS = {
  db: 'bg-success/15 text-success border-success/30',
  env: 'bg-info/15 text-info border-info/30',
  unset: 'bg-white/5 text-text-3 border-white/10',
};

export default function SenderIdentitiesPanel() {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/settings/email')
      .then(r => setSettings(r.data.settings))
      .catch(() => setError(t('admin.emailSettings.loadFailed')));
  }, [t]);

  if (error) {
    return <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>;
  }
  if (!settings) {
    return <div className="h-40 animate-pulse rounded-xl border border-white/10 bg-bg-card" />;
  }

  const rows = identityRows(settings, t);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] leading-relaxed text-text-3">
          {t('admin.communications.identities.hint')}
        </p>
        <button
          type="button"
          className={ADMIN_BTN}
          onClick={() => setParams({ channel: 'email', sub: 'provider' })}
        >
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">tune</span>
          {t('admin.communications.identities.editInProvider')}
        </button>
      </div>

      <AdminTable
        columns={[
          { key: 'field', label: t('admin.communications.identities.columnField') },
          { key: 'value', label: t('admin.communications.identities.columnValue') },
          { key: 'source', label: t('admin.communications.identities.columnSource') },
        ]}
        minWidth={560}
      >
        {rows.map(row => (
          <AdminTableRow key={row.key}>
            <AdminTableCell className="whitespace-nowrap font-bold text-text-2">{t(row.labelKey)}</AdminTableCell>
            <AdminTableCell className={row.mono ? 'font-mono text-text-1' : 'text-text-1'}>
              {row.value ?? <span className="text-text-3/70">{t('admin.emailSettings.sourceUnset')}</span>}
            </AdminTableCell>
            <AdminTableCell>
              <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${SOURCE_CLS[row.source] ?? SOURCE_CLS.unset}`}>
                {t(`admin.emailSettings.source${row.source === 'db' ? 'Panel' : row.source === 'env' ? 'Env' : 'Unset'}`)}
              </span>
            </AdminTableCell>
          </AdminTableRow>
        ))}
      </AdminTable>
    </div>
  );
}
