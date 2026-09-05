import { useState } from 'react';
import { useTranslation } from '../../i18n';

const STATUS_CLS = {
  open: 'bg-accent/15 text-accent',
  in_progress: 'bg-warning/15 text-warning',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-white/5 text-text-3',
};
const STATUS_I18N_KEY = { open: 'open', in_progress: 'inProgress', resolved: 'resolved', closed: 'closed' };

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TicketDetailView({ ticket, onSendReply, onBack }) {
  const { t } = useTranslation();
  const [reply, setReply] = useState('');

  const isClosed = ticket?.status === 'closed';
  const canSend = !isClosed && reply.trim().length > 0;

  function handleSend() {
    const text = reply.trim();
    if (!text || !onSendReply) return;
    onSendReply(text);
    setReply('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!ticket) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button
          onClick={onBack}
          className="mb-4 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1 transition"
        >
          ← {t('ticket.back')}
        </button>
        <div className="bg-bg-card border border-dashed border-white/10 rounded-xl py-14 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-semibold text-text-1">{t('ticket.notFound')}</p>
        </div>
      </div>
    );
  }

  const statusKey = STATUS_I18N_KEY[ticket.status];
  const cls = STATUS_CLS[ticket.status] || 'bg-white/5 text-text-3';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="mb-4 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1 transition"
      >
        ← {t('ticket.back')}
      </button>

      <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-text-1">{ticket.subject}</h1>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${cls}`}>
            {statusKey ? t(`ticket.status.${statusKey}`) : t('ticket.status.unknown')}
          </span>
        </div>
        <p className="text-text-3 text-xs mt-1.5">
          {t('ticket.openedAt', { date: formatDateTime(ticket.createdAt) })} · {t('ticket.messageCount', { count: (ticket.messages || []).length })}
        </p>
      </div>

      <div className="space-y-3 max-h-[55vh] overflow-y-auto no-scrollbar pr-1">
        {(ticket.messages || []).map((msg, i) => {
          const isPlayer = msg.senderRole === 'player';
          return (
            <div key={msg._id || i} className={`flex ${isPlayer ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              <div
                className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                  isPlayer
                    ? 'bg-primary/20 rounded-br-sm'
                    : 'bg-bg-hover border border-white/10 rounded-bl-sm'
                }`}
              >
                <div className={`text-[11px] font-medium mb-1 ${isPlayer ? 'text-text-2' : 'text-accent'}`}>
                  {isPlayer ? t('ticket.you') : t('ticket.supportTeam')}
                </div>
                <p className="text-sm text-text-1 whitespace-pre-wrap break-words">{msg.text}</p>
                <div className="text-[10px] text-text-3 text-right mt-1">
                  {formatDateTime(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {isClosed ? (
          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-text-3 text-sm text-center">
            {t('ticket.closedNotice')}
          </div>
        ) : (
          <>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder={t('ticket.replyPlaceholder')}
              className="w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:border-accent/40 outline-none resize-none transition"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-text-3 text-xs">{t('ticket.sendHint')}</span>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {t('ticket.send')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
