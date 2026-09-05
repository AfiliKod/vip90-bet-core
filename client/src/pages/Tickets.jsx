import { useEffect, useState } from 'react';
import api from '../services/api';
import { useTranslation } from '../i18n';
import TicketListView from '../components/tickets/TicketListView';
import TicketDetailView from '../components/tickets/TicketDetailView';

/** Yardım Merkezi — oyuncu tarafı. TicketListView/TicketDetailView (opencode üretimi, saf UI) burada state+API'ye bağlanır. */
export default function Tickets() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');

  function loadList() {
    setError('');
    api.get('/tickets/mine')
      .then(({ data }) => setTickets(data))
      .catch(() => setError(t('ticket.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(loadList, []);

  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    api.get(`/tickets/mine/${selectedId}`)
      .then(({ data }) => setSelected(data))
      .catch(() => setError(t('ticket.loadError')));
  }, [selectedId]);

  async function handleSendReply(text) {
    setError('');
    try {
      const { data } = await api.post(`/tickets/mine/${selectedId}/reply`, { message: text });
      setSelected(data);
      loadList();
    } catch {
      setError(t('ticket.replyError'));
    }
  }

  async function handleCreate() {
    if (!newSubject.trim() || !newMessage.trim()) return;
    setError('');
    try {
      const { data } = await api.post('/tickets/mine', { subject: newSubject, message: newMessage });
      setShowNewForm(false);
      setNewSubject('');
      setNewMessage('');
      loadList();
      setSelectedId(data._id);
    } catch {
      setError(t('ticket.createError'));
    }
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-text-3 text-sm">{t('ticket.loading')}</div>;
  }

  return (
    <div>
      {error && (
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
        </div>
      )}

      {selectedId ? (
        <TicketDetailView
          ticket={selected}
          onSendReply={handleSendReply}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <TicketListView
          tickets={tickets}
          onSelectTicket={setSelectedId}
          onNewTicket={() => setShowNewForm(true)}
        />
      )}

      {showNewForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowNewForm(false)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4 text-text-1">{t('ticket.newTicket')}</h2>
            <label className="text-xs text-text-3 block mb-3">
              {t('ticket.subject')}
              <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                placeholder={t('ticket.subjectPlaceholder')}
                className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
            </label>
            <label className="text-xs text-text-3 block mb-4">
              {t('ticket.message')}
              <textarea value={newMessage} rows={4} onChange={e => setNewMessage(e.target.value)}
                placeholder={t('ticket.messagePlaceholder')}
                className="mt-1 w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1" />
            </label>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">{t('ticket.create')}</button>
              <button onClick={() => setShowNewForm(false)} className="px-4 py-2 rounded-lg border border-white/10 text-text-2 text-sm">{t('ticket.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
