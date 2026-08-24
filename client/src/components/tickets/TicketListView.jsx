const STATUS_META = {
  open: { label: 'Açık', cls: 'bg-accent/15 text-accent' },
  in_progress: { label: 'İşlemde', cls: 'bg-warning/15 text-warning' },
  resolved: { label: 'Çözüldü', cls: 'bg-success/15 text-success' },
  closed: { label: 'Kapandı', cls: 'bg-white/5 text-text-3' },
};

function getStatusMeta(status) {
  return STATUS_META[status] || { label: 'Bilinmiyor', cls: 'bg-white/5 text-text-3' };
}

function getLastMessage(ticket) {
  const msgs = ticket?.messages;
  return Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : null;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TicketListView({ tickets = [], onSelectTicket, onNewTicket }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-1">🎧 Yardım Merkezi</h1>
          <p className="text-text-3 text-sm mt-1">
            Destek talepleriniz{tickets.length > 0 ? ` (${tickets.length})` : ''}
          </p>
        </div>
        <button
          onClick={onNewTicket}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium shrink-0"
        >
          + Yeni Talep
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="bg-bg-card border border-dashed border-white/10 rounded-xl py-16 px-6 text-center animate-fade-in">
          <div className="text-4xl mb-3">📨</div>
          <p className="font-semibold text-text-1">Henüz bir destek talebiniz yok</p>
          <p className="text-text-3 text-sm mt-1">
            Bir sorun mu yaşıyorsunuz? Talep oluşturun, ekibimiz kısa sürede yanıtlasın.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const meta = getStatusMeta(ticket.status);
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
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-text-2 text-sm mt-1.5 truncate">
                  {lastMsg ? lastMsg.text : 'Mesaj yok'}
                </p>
                <div className="flex items-center gap-1 text-text-3 text-xs mt-2">
                  <span>🕒</span>
                  <span>{formatDateTime(ticket.createdAt)}</span>
                  <span>· {(ticket.messages || []).length} mesaj</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
