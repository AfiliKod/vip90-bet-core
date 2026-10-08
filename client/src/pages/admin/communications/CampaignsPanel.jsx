// client/src/pages/admin/communications/CampaignsPanel.jsx
//
// İletişim → Campaigns: iki kanalın ZAMANA DUYARLI gönderimlerinin tek
// bakışta görünümü. Veri mevcut uçlardan gelir (mail: category=scheduled,
// SMS: type=scheduled) — yeni bir gönderim modeli açılmaz.
//
// SMS'te otomatik zamanlama YOK (15 dk'lık `runDueScheduledMails` job'ının
// SMS karşılığı üretilmedi); bu yüzden SMS satırları `auto:false` ile
// gösterilir ve panelin üstünde durum notu vardır.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useFormatters } from '../../../i18n/useFormatters.jsx';
import { AdminKpiCard, AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell } from '../../../components/admin/AdminTable.jsx';
import { normalizeCampaignRows, audienceLabelKey } from './communicationsLogic.js';

export default function CampaignsPanel() {
  const { t } = useTranslation();
  const { formatDateTime, formatNumber } = useFormatters();
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState({ total: 0, auto: 0, manual: 0 });
  const [error, setError] = useState('');

  // Fetch effect: setState yalnız await sonrası (async) çağrılır (bkz.
  // AutomationsPanel — repoda effect gövdesinde senkron setState hatadır).
  useEffect(() => {
    let alive = true;
    (async () => {
      setError('');
      try {
        const [mailRes, smsRes] = await Promise.all([
          api.get('/admin/mail-templates', { params: { category: 'scheduled', limit: 100 } }),
          api.get('/admin/sms/templates', { params: { type: 'scheduled' } }),
        ]);
        if (!alive) return;
        const list = normalizeCampaignRows({
          mailTemplates: mailRes.data.templates || [],
          smsTemplates: smsRes.data.templates || [],
        });
        setRows(list);
        setStats({
          total: list.length,
          auto: list.filter(r => r.auto).length,
          manual: list.filter(r => !r.auto).length,
        });
      } catch (e) {
        if (!alive) return;
        setError(e.response?.data?.error?.message || t('admin.communications.campaigns.loadFailed'));
      }
    })();
    return () => { alive = false; };
  }, [t]);

  return (
    <div>
      <div className="mb-4 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-[13px] text-info">
        {t('admin.communications.campaigns.note')}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <AdminKpiCard label={t('admin.communications.campaigns.statTotal')} value={formatNumber(stats.total)} />
        <AdminKpiCard label={t('admin.communications.campaigns.statAuto')} value={formatNumber(stats.auto)} tone="text-gold" />
        <AdminKpiCard label={t('admin.communications.campaigns.statManual')} value={formatNumber(stats.manual)} tone="text-primary" />
      </section>

      <AdminTable
        columns={[
          { key: 'channel', label: t('admin.communications.columnChannel') },
          { key: 'name', label: t('admin.communications.campaigns.columnCampaign') },
          { key: 'audience', label: t('admin.communications.campaigns.columnAudience') },
          { key: 'schedule', label: t('admin.communications.campaigns.columnSchedule') },
          { key: 'sent', label: t('admin.communications.campaigns.columnSent'), align: 'right' },
          { key: 'lastSent', label: t('admin.communications.campaigns.columnLastSent') },
          { key: 'actions', label: '' },
        ]}
        loading={rows == null && !error}
        empty={!!rows && rows.length === 0}
        emptyLabel={t('admin.communications.campaigns.empty')}
        minWidth={900}
      >
        {(rows || []).map(row => (
          <AdminTableRow key={`${row.channel}-${row.id}`}>
            <AdminTableCell>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-text-2">
                <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">
                  {row.channel === 'email' ? 'mail' : 'sms'}
                </span>
                {t(row.channel === 'email' ? 'admin.communications.channelEmail' : 'admin.communications.channelSms')}
              </span>
            </AdminTableCell>
            <AdminTableCell className="max-w-[260px] truncate font-bold text-text-1">{row.name}</AdminTableCell>
            <AdminTableCell className="text-text-2">{t(audienceLabelKey(row.channel, row.audience))}</AdminTableCell>
            <AdminTableCell className="whitespace-nowrap text-text-2">
              {row.auto
                ? t('admin.communications.campaigns.everyHours', { hours: formatNumber(row.intervalHours ?? 0) })
                : t('admin.communications.campaigns.manualOnly')}
            </AdminTableCell>
            <AdminTableCell align="right" className="font-mono tabular-nums">{formatNumber(row.sentCount)}</AdminTableCell>
            <AdminTableCell className="whitespace-nowrap font-mono text-xs text-text-3">{formatDateTime(row.lastSentAt)}</AdminTableCell>
            <AdminTableActionsCell>
              <Link
                to={`/admin/communications?channel=${row.channel}&sub=templates`}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary transition hover:brightness-110"
              >
                {t('admin.communications.campaigns.manage')}
                <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">arrow_forward</span>
              </Link>
            </AdminTableActionsCell>
          </AdminTableRow>
        ))}
      </AdminTable>
    </div>
  );
}
