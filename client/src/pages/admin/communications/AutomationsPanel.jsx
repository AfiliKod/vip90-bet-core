// client/src/pages/admin/communications/AutomationsPanel.jsx
//
// İletişim → Automations: her iki kanalın OLAY KATALOĞU (aksiyona bağlı
// tetikleyiciler + zamana duyarlı şablonlar) tek tabloda. "Otomasyon
// çalışıyor mu" sorusunun cevabı burada: satır, olaya bağlı bir şablon
// OLUP OLMADIĞINI ve hangisi olduğunu gösterir.
//
// Veri: e-posta `GET /admin/mail-templates/events` (katalog + bağlı şablon),
// SMS `GET /admin/sms/templates` (tek istekte hem olay listesi hem şablonlar).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { AdminKpiCard, AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell } from '../../../components/admin/AdminTable.jsx';
import { normalizeAutomationRows } from './communicationsLogic.js';

export default function AutomationsPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState({ total: 0, bound: 0, unbound: 0 });
  const [error, setError] = useState('');

  // Fetch effect: setState yalnız await sonrası (async) çağrılır —
  // effect gövdesinde senkron setState bu repoda eslint hatası üretir.
  useEffect(() => {
    let alive = true;
    (async () => {
      setError('');
      try {
        const [mailRes, smsRes] = await Promise.all([
          api.get('/admin/mail-templates/events'),
          api.get('/admin/sms/templates'),
        ]);
        if (!alive) return;
        const list = normalizeAutomationRows({
          mailEvents: mailRes.data.events || [],
          smsEvents: smsRes.data.events || {},
          smsTemplates: smsRes.data.templates || [],
        });
        const bound = list.filter(r => r.usedBy).length;
        setRows(list);
        setStats({ total: list.length, bound, unbound: list.length - bound });
      } catch (e) {
        if (!alive) return;
        setError(e.response?.data?.error?.message || t('admin.communications.automations.loadFailed'));
      }
    })();
    return () => { alive = false; };
  }, [t]);

  const varsOf = (variables) => (variables || []).slice(0, 6).join(', ')
    + ((variables || []).length > 6 ? ` +${variables.length - 6}` : '');

  return (
    <div>
      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-text-3">
        {t('admin.communications.automations.hint')}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <AdminKpiCard label={t('admin.communications.automations.statTotal')} value={String(stats.total)} />
        <AdminKpiCard label={t('admin.communications.automations.statBound')} value={String(stats.bound)} tone="text-success" />
        <AdminKpiCard label={t('admin.communications.automations.statUnbound')} value={String(stats.unbound)} tone="text-warning" />
      </section>

      <AdminTable
        columns={[
          { key: 'channel', label: t('admin.communications.columnChannel') },
          { key: 'event', label: t('admin.communications.automations.columnEvent') },
          { key: 'type', label: t('admin.communications.automations.columnType') },
          { key: 'variables', label: t('admin.communications.automations.columnVariables') },
          { key: 'template', label: t('admin.communications.automations.columnTemplate') },
          { key: 'actions', label: '' },
        ]}
        loading={rows == null && !error}
        empty={!!rows && rows.length === 0}
        emptyLabel={t('admin.communications.automations.empty')}
        minWidth={920}
      >
        {(rows || []).map(row => {
          const isEmail = row.channel === 'email';
          const labelKey = isEmail
            ? `admin.mailTemplates.event.${row.event}`
            : `admin.smsTemplates.event.${row.event}`;
          return (
            <AdminTableRow key={`${row.channel}-${row.event}`}>
              <AdminTableCell>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-bold text-text-2">
                  <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">
                    {isEmail ? 'mail' : 'sms'}
                  </span>
                  {t(isEmail ? 'admin.communications.channelEmail' : 'admin.communications.channelSms')}
                </span>
              </AdminTableCell>
              <AdminTableCell className="text-text-1">
                <div className="font-bold">{t(labelKey)}</div>
                <div className="font-mono text-[11px] text-text-3">{row.event}</div>
              </AdminTableCell>
              <AdminTableCell>
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                  row.type === 'action'
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-gold/30 bg-gold/10 text-gold'
                }`}>
                  {t(`admin.communications.automations.type.${row.type}`)}
                </span>
              </AdminTableCell>
              <AdminTableCell className="max-w-[240px] truncate font-mono text-[11px] text-text-3" title={(row.variables || []).join(', ')}>
                {varsOf(row.variables) || '—'}
              </AdminTableCell>
              <AdminTableCell className="max-w-[240px] truncate text-text-2">
                {row.usedBy || <span className="text-warning/90">{t('admin.communications.automations.noTemplate')}</span>}
              </AdminTableCell>
              <AdminTableActionsCell>
                <Link
                  to={`/admin/communications?channel=${row.channel}&sub=templates`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary transition hover:brightness-110"
                >
                  {t('admin.communications.automations.manage')}
                  <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">arrow_forward</span>
                </Link>
              </AdminTableActionsCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>
    </div>
  );
}
