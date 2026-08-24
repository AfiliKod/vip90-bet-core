import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_CLS = {
  open: 'bg-accent/15 text-accent',
  in_progress: 'bg-warning/15 text-warning',
  resolved: 'bg-success/15 text-success',
  closed: 'bg-white/5 text-text-3',
};

// i18n anahtar kuralı alt çizgi kabul etmiyor (camelCase zorunlu) — backend
// status değerleri (in_progress) ile i18n anahtarları arasındaki tek fark bu.
const STATUS_I18N_KEY = { open: 'open', in_progress: 'inProgress', resolved: 'resolved', closed: 'closed' };

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminTickets() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');

  function loadList() {
    setError('');
    api.get('/tickets', { params: filter === 'all' ? {} : { status: filter } })
      .then(({ data }) => setTickets(data))
      .catch(() => setError(t('admin.tickets.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(loadList, [filter]);

  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    api.get(`/tickets/${selectedId}`)
      .then(({ data }) => setSelected(data))
      .catch(() => setError(t('admin.tickets.loadError')));
  }, [selectedId]);

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
    try {
      const { data } = await api.patch(`/tickets/${selectedId}/status`, { status });
      setSelected(data);
      loadList();
    } catch {
      setError(t('admin.tickets.statusChangeError'));
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t('admin.tickets.title')}</h1>
      <p className="text-text-3 text-sm mb-6">{t('admin.tickets.subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      <div className="flex gap-2 mb-4">
        {['all', ...STATUS_OPTIONS].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${filter === s ? 'border-primary text-primary' : 'border-white/10 text-text-3'}`}>
            {s === 'all' ? t('admin.tickets.filterAll') : t(`ticket.status.${STATUS_I18N_KEY[s]}`)}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
        <div className="space-y-2">
          {loading ? (
            <div className="text-text-3 text-sm">{t('admin.tickets.loading')}</div>
          ) : tickets.length === 0 ? (
            <div className="text-text-3 text-sm">{t('admin.tickets.empty')}</div>
          ) : (
            tickets.map(ticket => (
              <button key={ticket._id} onClick={() => setSelectedId(ticket._id)}
                className={`w-full text-left bg-bg-card border rounded-xl p-3 transition ${selectedId === ticket._id ? 'border-primary/40' : 'border-white/10 hover:border-white/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-1 text-sm truncate">{ticket.subject}</span>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${STATUS_CLS[ticket.status]}`}>{t(`ticket.status.${STATUS_I18N_KEY[ticket.status]}`)}</span>
                </div>
                <div className="text-text-3 text-xs mt-1">{formatDateTime(ticket.createdAt)} · {ticket.messages.length} mesaj</div>
              </button>
            ))
          )}
        </div>

        <div className="bg-bg-card border border-white/10 rounded-xl p-4">
          {!selected ? (
            <div className="text-text-3 text-sm text-center py-10">{t('admin.tickets.empty')}</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-semibold text-text-1">{selected.subject}</h2>
                <select value={selected.status} onChange={e => changeStatus(e.target.value)}
                  className="h-8 rounded-lg bg-bg-base border border-white/10 px-2 text-xs text-text-1">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`ticket.status.${STATUS_I18N_KEY[s]}`)}</option>)}
                </select>
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto no-scrollbar pr-1 mb-4">
                {selected.messages.map((msg, i) => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div key={msg._id || i} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${isAdmin ? 'bg-primary/20 rounded-br-sm' : 'bg-bg-hover border border-white/10 rounded-bl-sm'}`}>
                        <div className={`text-[11px] font-medium mb-1 ${isAdmin ? 'text-accent' : 'text-text-2'}`}>
                          {isAdmin ? 'Destek Ekibi' : 'Oyuncu'}
                        </div>
                        <p className="text-sm text-text-1 whitespace-pre-wrap break-words">{msg.text}</p>
                        <div className="text-[10px] text-text-3 text-right mt-1">{formatDateTime(msg.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <textarea value={reply} rows={3} onChange={e => setReply(e.target.value)}
                placeholder={t('ticket.messagePlaceholder')}
                className="w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1 resize-none" />
              <button onClick={sendReply} className="mt-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">
                {t('ticket.send')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
