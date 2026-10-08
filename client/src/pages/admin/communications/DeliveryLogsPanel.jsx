// client/src/pages/admin/communications/DeliveryLogsPanel.jsx
//
// İletişim → (E-posta|SMS) → Delivery logs: iki kanalın gönderim günlükleri
// TEK bileşende. Kayıtlar farklı modellerden gelir (SystemMailLog: sentAt/to/
// subject · SmsLog: createdAt/phone/body) — `normalizeLogRow` satırı ortak
// biçime indirger, tablo tek olur.
//
// Sayfalama: e-posta sunucuda (sayfa/limit), SMS uç sunucuda sayfalama
// vermez (yalnız `limit`), bu yüzden en fazla 200 kayıt çekilir ve istemcide
// dilimlenir.
import { useEffect, useState } from 'react';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useFormatters } from '../../../i18n/useFormatters.jsx';
import { AdminTabs } from '../../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard } from '../../../components/admin/AdminTable.jsx';
import { normalizeLogRow } from './communicationsLogic.js';

const PAGE_SIZE = 20;
const SMS_FETCH_LIMIT = 200;
const STATUS_TONE = {
  sent: 'bg-success/15 text-success border-success/30',
  mock: 'bg-info/15 text-info border-info/30',
  failed: 'bg-danger/20 text-danger border-danger/30',
  skipped: 'bg-warning/15 text-warning border-warning/30',
};

export default function DeliveryLogsPanel({ channel }) {
  const { t } = useTranslation();
  const { formatDateTime, formatNumber } = useFormatters();
  const isEmail = channel === 'email';

  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch effect: setState yalnız await sonrası (async) çağrılır (bkz.
  // AutomationsPanel — repoda effect gövdesinde senkron setState hatadır).
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (isEmail) {
          const params = { page, limit: PAGE_SIZE };
          if (status !== 'all') params.status = status;
          const res = await api.get('/admin/mail-templates/logs', { params });
          if (!alive) return;
          setRows((res.data.logs || []).map(l => normalizeLogRow('email', l)));
          setPages(res.data.pages || 1);
          setTotal(res.data.total ?? 0);
          setSummary(null);
        } else {
          const res = await api.get('/admin/sms/logs', { params: { limit: SMS_FETCH_LIMIT } });
          if (!alive) return;
          const all = (res.data.logs || []).map(l => normalizeLogRow('sms', l));
          const filtered = status === 'all' ? all : all.filter(r => r.status === status);
          const start = (page - 1) * PAGE_SIZE;
          setRows(filtered.slice(start, start + PAGE_SIZE));
          setPages(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
          setTotal(filtered.length);
          setSummary(res.data.summary || null);
        }
      } catch (e) {
        if (!alive) return;
        setError(e.response?.data?.error?.message || t('admin.communications.logs.loadFailed'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isEmail, page, status, t]);

  // Filtre değişince sayfa 1'e dön (yoksa yeni filtrede boş sayfa görünür).
  const setFilter = (key) => { setPage(1); setStatus(key); };

  const statusTabs = [
    { key: 'all', label: t('admin.communications.logs.filterAll') },
    { key: 'sent', label: t('admin.communications.logs.status.sent') },
    ...(isEmail ? [{ key: 'mock', label: t('admin.communications.logs.status.mock') }] : []),
    { key: 'failed', label: t('admin.communications.logs.status.failed') },
    { key: 'skipped', label: t('admin.communications.logs.status.skipped') },
  ];

  const columns = [
    { key: 'time', label: t('admin.communications.logs.columnTime') },
    { key: 'recipient', label: t('admin.communications.logs.columnRecipient') },
    { key: 'content', label: t('admin.communications.logs.columnContent') },
    ...(isEmail ? [] : [{ key: 'user', label: t('admin.communications.logs.columnUser') }]),
    { key: 'status', label: t('admin.communications.logs.columnStatus') },
    { key: 'error', label: t('admin.communications.logs.columnError') },
  ];

  return (
    <div>
      {summary && (
        <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
          <AdminKpiCard label={t('admin.communications.logs.filterAll')} value={formatNumber(summary.sent + summary.failed + summary.skipped)} />
          <AdminKpiCard label={t('admin.communications.logs.status.sent')} value={formatNumber(summary.sent)} tone="text-success" />
          <AdminKpiCard label={t('admin.communications.logs.status.failed')} value={formatNumber(summary.failed)} tone="text-danger" />
        </section>
      )}

      <AdminTabs items={statusTabs} value={status} onChange={setFilter} className="mb-4" />

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <AdminTable
        columns={columns}
        loading={loading}
        empty={!loading && rows.length === 0}
        emptyLabel={t('admin.communications.logs.empty')}
        minWidth={isEmail ? 860 : 900}
      >
        {rows.map(row => (
          <AdminTableRow key={row.id}>
            <AdminTableCell className="whitespace-nowrap font-mono text-xs text-text-3">{formatDateTime(row.time)}</AdminTableCell>
            <AdminTableCell className="font-mono text-xs">{row.recipient || '—'}</AdminTableCell>
            <AdminTableCell className="max-w-[280px] truncate">{row.content || '—'}</AdminTableCell>
            {!isEmail && <AdminTableCell className="text-text-2">{row.username || '—'}</AdminTableCell>}
            <AdminTableCell>
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[row.status] ?? STATUS_TONE.failed}`}>
                {t(`admin.communications.logs.status.${row.status}`)}
              </span>
            </AdminTableCell>
            <AdminTableCell className="max-w-[220px] truncate text-[12px] text-danger/90" title={row.error}>
              {row.error || '—'}
            </AdminTableCell>
          </AdminTableRow>
        ))}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.communications.logs.total', { count: formatNumber(total) })}
      />
    </div>
  );
}
