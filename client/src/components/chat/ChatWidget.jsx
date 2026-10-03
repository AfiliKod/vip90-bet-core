import { useState } from 'react';
import { useTranslation } from '../../i18n';

const SYSTEM_META = {
  system: { icon: 'ℹ️', cls: 'text-text-3' },
  tip: { icon: '💸', cls: 'text-warning' },
  rain: { icon: '🌧️', cls: 'text-neon-cyan' },
};

function formatTime(value, locale) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function SystemNotice({ msg }) {
  const meta = SYSTEM_META[msg.type] || SYSTEM_META.system;
  return (
    <div className="flex justify-center animate-fade-in">
      <p className={`max-w-[85%] text-center text-[11px] italic leading-relaxed ${meta.cls}`}>
        <span className="mr-1 not-italic">{meta.icon}</span>
        {msg.message}
      </p>
    </div>
  );
}

function MessageBubble({ msg, isMine, onOpenTip, t, locale }) {
  return (
    <div className={`flex flex-col animate-fade-in ${isMine ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 ${
          isMine
            ? 'bg-primary/25 rounded-br-sm'
            : 'bg-bg-hover border border-white/10 rounded-bl-sm'
        }`}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[11px] font-medium ${isMine ? 'text-text-2' : 'text-accent'}`}>
            {isMine ? t('common.you') : msg.username}
          </span>
          <span className="text-[10px] text-text-3">{formatTime(msg.createdAt, locale)}</span>
        </div>
        <p className="text-sm text-text-1 whitespace-pre-wrap break-words">{msg.message}</p>
      </div>
      {!isMine && (
        <button
          onClick={() => onOpenTip && onOpenTip(msg.userId, msg.username)}
          className="mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-text-3 border border-white/10 hover:text-warning hover:border-warning/40 transition"
        >
          💸 {t('chat.sendTip')}
        </button>
      )}
    </div>
  );
}

export default function ChatWidget({
  isOpen,
  onToggle,
  messages,
  currentUserId,
  onSendMessage,
  onOpenTip,
  onlineCount,
}) {
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState('');

  const list = Array.isArray(messages) ? messages : [];
  const canSend = draft.trim().length > 0;
  const showOnline = typeof onlineCount === 'number' && onlineCount > 0;

  function handleSend() {
    const text = draft.trim();
    if (!text || !onSendMessage) return;
    onSendMessage(text);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label={t('chat.title')}
        className="fixed bottom-5 left-5 z-50 w-14 h-14 rounded-full bg-primary text-white text-2xl shadow-lg shadow-black/40 flex items-center justify-center transition hover:scale-105 active:scale-95"
      >
        💬
        {showOnline && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-success text-bg-deep text-[10px] font-bold flex items-center justify-center animate-pulse-glow">
            {onlineCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 left-5 z-50 w-[340px] h-[480px] max-w-[calc(100vw-2rem)] flex flex-col rounded-xl bg-bg-card border border-white/10 shadow-2xl shadow-black/50 overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-bold text-text-1">{t('chat.title')}</h2>
        {showOnline && (
          <span className="flex items-center gap-1.5 text-[11px] text-text-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            {onlineCount}
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={t('common.cancel')}
          className="ml-auto w-7 h-7 rounded-lg text-text-3 hover:text-text-1 hover:bg-bg-hover flex items-center justify-center transition"
        >
          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-2.5">
        {list.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-xs text-text-3">{t('chat.empty')}</p>
          </div>
        ) : (
          list.map((msg, i) =>
            msg.type && msg.type !== 'text' ? (
              <SystemNotice key={msg._id || i} msg={msg} />
            ) : (
              <MessageBubble
                key={msg._id || i}
                msg={msg}
                isMine={msg.userId === currentUserId}
                onOpenTip={onOpenTip}
                t={t}
                locale={locale}
              />
            )
          )
        )}
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-white/10 shrink-0">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={300}
          placeholder={t('chat.placeholder')}
          className="flex-1 min-w-0 rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:border-accent/40 outline-none transition"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label={t('chat.send')}
          className="shrink-0 w-9 h-9 rounded-lg bg-primary text-white text-sm flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">send</span>
        </button>
      </div>
    </div>
  );
}
