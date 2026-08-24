import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from '../../i18n';
import { connectChatSocket } from '../../services/chatSocket';
import api from '../../services/api';
import ChatWidget from './ChatWidget';
import TipModal from './TipModal';
import RainAnnouncement from './RainAnnouncement';

/**
 * P1/P2 — sohbet + bahşiş. ChatWidget/TipModal/RainAnnouncement (opencode
 * üretimi, saf UI) burada socket bağlantısına ve API'ye bağlanır. Misafir
 * kullanıcılar için hiçbir şey render etmez — backend /chat namespace'i
 * JWT auth zorunlu tutuyor.
 */
export default function ChatWidgetContainer() {
  const { user, token } = useAuthStore();
  const notify = useToastStore(s => s.add);
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tipTarget, setTipTarget] = useState(null); // { userId, username }
  const [rainEvent, setRainEvent] = useState(null);
  const sockRef = useRef(null);
  const rainTimeoutRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const sock = connectChatSocket(token, {
      onAuthFailed: () => notify(t('chat.connectionError'), 'info'),
    });
    sockRef.current = sock;

    sock.on('connect', async () => {
      try {
        const { data } = await api.get('/chat/rooms');
        const activeRoom = data.rooms?.[0];
        if (!activeRoom || cancelled) return;
        setRoom(activeRoom);
        sock.emit('chat:join', { roomId: activeRoom._id });

        const { data: history } = await api.get(`/chat/rooms/${activeRoom.slug}/messages`);
        if (!cancelled) {
          const normalized = (history.messages || []).map(m => ({
            ...m,
            userId: m.userId?._id || m.userId,
            username: m.userId?.username,
          }));
          setMessages(normalized);
        }
      } catch { /* oda yoksa sohbet sessizce devre dışı kalır */ }
    });

    sock.on('chat:message', (msg) => {
      setMessages(prev => [...prev, { ...msg, userId: msg.userId?._id || msg.userId, username: msg.userId?.username }]);
    });
    sock.on('chat:messageDeleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    });
    sock.on('chat:rain', ({ totalAmount, recipients }) => {
      clearTimeout(rainTimeoutRef.current);
      setRainEvent({ totalAmount, recipientCount: recipients });
      rainTimeoutRef.current = setTimeout(() => setRainEvent(null), 6000);
    });
    sock.on('chat:error', ({ message }) => notify(message, 'info'));

    return () => {
      cancelled = true;
      clearTimeout(rainTimeoutRef.current);
      sock.disconnect();
    };
  }, [user, token]);

  if (!user) return null;

  const currentUserId = user._id || user.id;

  function handleSendMessage(text) {
    if (!room || !sockRef.current) return;
    sockRef.current.emit('chat:send', { roomId: room._id, message: text });
  }

  function handleOpenTip(userId, username) {
    setTipTarget({ userId, username });
  }

  function handleSendTip(amount, message) {
    if (!room || !sockRef.current || !tipTarget) return;
    sockRef.current.emit('chat:tip', { roomId: room._id, toUserId: tipTarget.userId, amount, message });
    setTipTarget(null);
  }

  return (
    <>
      <ChatWidget
        isOpen={isOpen}
        onToggle={() => setIsOpen(o => !o)}
        messages={messages}
        currentUserId={currentUserId}
        onSendMessage={handleSendMessage}
        onOpenTip={handleOpenTip}
      />
      <TipModal
        isOpen={!!tipTarget}
        toUsername={tipTarget?.username}
        onSend={handleSendTip}
        onClose={() => setTipTarget(null)}
      />
      <RainAnnouncement event={rainEvent} onDismiss={() => setRainEvent(null)} />
    </>
  );
}
