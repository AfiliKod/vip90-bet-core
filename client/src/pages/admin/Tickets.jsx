import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs, ADMIN_BTN_PRIMARY, ADMIN_BTN_GHOST } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableEmpty } from '../../components/admin/AdminTable.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { useAdminCountsStore } from '../../store/adminCountsStore.js';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];

// Kuyruktan çıkmayan durumlar. `closed` listede ama sayaca dahil değil.
const OPEN_STATUSES = ['open', 'in_progress', 'resolved'];
const STATUS_CLS = {
  open: 'bg-info/15 text-info',
  in_progress: 'bg-warning/20 text-warning',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-white/10 text-text-3',
};

// i18n anahtar kuralı alt çizgi kabul etmiyor (camelCase zorunlu) — backend
// status değerleri (in_progress) ile i18n anahtarları arasındaki tek fark bu.
const STATUS_I18N_KEY = { open: 'open', in_progress: 'inProgress', resolved: 'resolved', closed: 'closed' };

function statusLabel(t, status) {
  const key = STATUS_I18N_KEY[status];
  return key ? t(`ticket.status.${key}`) : t('ticket.status.unknown');
}

export default function AdminTickets() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState('');

  function loadList() {
    setError('');
    api.get('/tickets', { params: filter === 'all' ? {} : { status: filter } })
      .then(({ data }) => setTickets(Array.isArray(data) ? data : data?.tickets || []))
      .catch(() => setError(t('admin.tickets.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(loadList, [filter]);

  useEffect(() => {
    if (!selectedId) { setSelected(null); setDetailLoading(false); return; }
    setDetailLoading(true);
    api.get(`/tickets/${selectedId}`)
      .then(({ data }) => setSelected(data))
      .catch(() => setError(t('admin.tickets.loadError')))
      .finally(() => setDetailLoading(false));
  }, [selectedId, t]);

  async function sendReply() {
    if (!reply.trim()) return;
    setError('');
    try {
      const { data } = await api.post(`/tickets/${selectedId}/reply`, { message: reply });
      setSelected(data);
      setReply('');
      loadList();
    } catch {
      setError(t('admin.tickets.replyError'));
    }
  }

  async function changeStatus(status) {
    setError('');
    const wasPending = OPEN_STATUSES.includes(selected?.status);
    const willBePending = OPEN_STATUSES.includes(status);
    try {
      // Optimistic: kuyruk sayacı HTTP yanitini beklemeden duser.
      // `closed` kuyruktan cikar, yeniden `open`e acmak geri ekler.
      if (wasPending !== willBePending) {
        useAdminCountsStore.getState().applyOptimistic('tickets', willBePending ? -1 : 1);
      }
      const { data } = await api.patch(`/tickets/${selectedId}/status`, { status });
      setSelected(data);
      loadList();
    } catch {
      // rollback
      if (wasPending !== willBePending) {
        useAdminCountsStore.getState().applyOptimistic('tickets', wasPending ? -1 : 1);
      }
      setError(t('admin.tickets.statusChangeError'));
    }
  }

  async function closeTicket() {
    await changeStatus('closed');
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.tickets.title') }]}
        title={t('admin.tickets.title')}
        sub={t('admin.tickets.subtitle')}
      >
        <AdminTabs
          items={['all', ...STATUS_OPTIONS].map(s => ({
            key: s,
            label: s === 'all' ? t('admin.tickets.filterAll') : statusLabel(t, s),
          }))}
          value={filter}
          onChange={setFilter}
        />
      </AdminPageHeader>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
        <div>
          <AdminTable
            columns={[
              { key: 'ticket', label: t('admin.tickets.columnTicket') },
              { key: 'status', label: t('admin.tickets.columnStatus') },
              { key: 'created', label: t('admin.tickets.columnCreated') },
            ]}
          >
            {loading ? (
              <AdminTableEmpty colSpan={3}>{t('admin.tickets.loading')}</AdminTableEmpty>
            ) : tickets.length === 0 ? (
              <AdminTableEmpty colSpan={3}>{t('admin.tickets.empty')}</AdminTableEmpty>
            ) : tickets.map(ticket => {
              const initials = (ticket.subject || '?').slice(0, 2).toUpperCase();
              return (
                <AdminTableRow
                  key={ticket._id}
                  className={`cursor-pointer ${selectedId === ticket._id ? 'bg-primary/10' : ''}`}
                  onClick={() => setSelectedId(ticket._id)}
                >
                  <AdminTableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-text-1">{ticket.subject}</div>
                        <div className="mt-0.5 font-mono text-xs text-text-3">
                          {t('admin.tickets.messageCount', { count: fmt.formatNumber(ticket.messages?.length || 0) })}
                        </div>
                      </div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${STATUS_CLS[ticket.status] || STATUS_CLS.closed}`}>
                      {statusLabel(t, ticket.status)}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="whitespace-nowrap font-mono text-xs text-text-3">{fmt.formatDateTime(ticket.createdAt)}</span>
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </AdminTable>
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          {detailLoading ? (
            <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
              <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
              <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
            </div>
          ) : !selected ? (
            <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
              <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">forum</span>
              <div className="mt-2 text-sm text-text-3">{t('admin.tickets.empty')}</div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">forum</span>
                  </span>
                  <h3 className="truncate text-sm font-extrabold text-text-1">{selected.subject}</h3>
                </div>
                {selected.status !== 'closed' ? (
                  <button
                    type="button"
                    onClick={closeTicket}
                    className={`${ADMIN_BTN_GHOST} h-8 shrink-0 gap-1.5 px-2.5 text-xs`}
                  >
                    <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">check_circle</span>
                    {t('admin.tickets.closeBtn')}
                  </button>
                ) : (
                  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-2.5 text-xs font-semibold text-text-3">
                    <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">lock</span>
                    {statusLabel(t, 'closed')}
                  </span>
                )}
                <select value={selected.status} onChange={e => changeStatus(e.target.value)}
                  aria-label={t('admin.tickets.statusLabel')}
                  className="h-8 shrink-0 rounded-lg border border-white/10 bg-bg-deep px-2 text-xs text-text-1 focus:border-white/25 focus:outline-none">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
                </select>
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto no-scrollbar pr-1 mb-4">
                {(selected.messages || []).map((msg, i) => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div key={msg._id || i} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${isAdmin ? 'bg-primary/20 rounded-br-sm' : 'bg-bg-hover border border-white/10 rounded-bl-sm'}`}>
                        <div className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${isAdmin ? 'text-primary' : 'text-text-2'}`}>
                          {isAdmin ? t('admin.tickets.senderSupport') : t('admin.tickets.senderPlayer')}
                        </div>
                        <p className="text-sm text-text-1 whitespace-pre-wrap break-words">{msg.text}</p>
                        <div className="text-[10px] text-text-3 text-right mt-1">{fmt.formatDateTime(msg.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <textarea value={reply} rows={3} onChange={e => setReply(e.target.value)}
                placeholder={t('ticket.messagePlaceholder')}
                className="w-full resize-none rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
              <button onClick={sendReply} disabled={!reply.trim() || !selectedId} className={`${ADMIN_BTN_PRIMARY} mt-2 disabled:cursor-not-allowed disabled:opacity-40`}>
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">send</span>
                {t('ticket.send')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
