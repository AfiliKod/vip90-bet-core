import { useTranslation } from '../../i18n';

const STATUS_CLS = {
  open: 'bg-accent/15 text-accent',
  in_progress: 'bg-warning/15 text-warning',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-white/5 text-text-3',
};
const STATUS_I18N_KEY = { open: 'open', in_progress: 'inProgress', resolved: 'resolved', closed: 'closed' };

function getLastMessage(ticket) {
  const msgs = ticket?.messages;
  return Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : null;
}

function formatDateTime(value, locale) {
  if (!value) return '';
  return new Date(value).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TicketListView({ tickets = [], onSelectTicket, onNewTicket }) {
  const { t, locale } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-1">🎧 {t('ticket.title')}</h1>
          <p className="text-text-3 text-sm mt-1">
            {t('ticket.yourTickets')}{tickets.length > 0 ? ` (${tickets.length.toLocaleString(locale)})` : ''}
          </p>
        </div>
        <button
          onClick={onNewTicket}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium shrink-0"
        >
          + {t('ticket.newTicket')}
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="bg-bg-card border border-dashed border-white/10 rounded-xl py-16 px-6 text-center animate-fade-in">
          <div className="text-4xl mb-3">📨</div>
          <p className="font-semibold text-text-1">{t('ticket.empty')}</p>
          <p className="text-text-3 text-sm mt-1">{t('ticket.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const statusKey = STATUS_I18N_KEY[ticket.status];
            const cls = STATUS_CLS[ticket.status] || 'bg-white/5 text-text-3';
            const lastMsg = getLastMessage(ticket);
            return (
              <div
                key={ticket._id}
                onClick={() => onSelectTicket && onSelectTicket(ticket._id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onSelectTicket && onSelectTicket(ticket._id); }}
                className="bg-bg-card border border-white/10 rounded-xl p-4 hover:border-accent/30 transition cursor-pointer animate-fade-in"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-text-1 truncate">{ticket.subject}</h3>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${cls}`}>
                    {statusKey ? t(`ticket.status.${statusKey}`) : t('ticket.status.unknown')}
                  </span>
                </div>
                <p className="text-text-2 text-sm mt-1.5 truncate">
                  {lastMsg ? lastMsg.text : t('ticket.noMessage')}
                </p>
                <div className="flex items-center gap-1 text-text-3 text-xs mt-2">
                  <span>🕒</span>
                  <span>{formatDateTime(ticket.createdAt, locale)}</span>
                  <span>· {t('ticket.messageCount', { count: (ticket.messages || []).length })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
