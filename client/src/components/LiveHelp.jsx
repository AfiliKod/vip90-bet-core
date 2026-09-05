import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useTranslation } from '../i18n';

const SUGGESTIONS = [
  'livehelp.faq.deposit',
  'livehelp.faq.withdraw',
  'livehelp.faq.liveBet',
  'livehelp.faq.verify',
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-3 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function LiveHelp({ open, onClose }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: t('livehelp.welcome'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await api.post('/help/chat', { messages: history });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply, escalated: !!res.data.escalated }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: t('livehelp.unavailable') },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const summarize = useCallback(async () => {
    if (messages.length < 3 || loading) return;
    await send(t('livehelp.summarize'));
  }, [messages, loading, send]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-[340px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-2xl border border-white/15 bg-bg-card overflow-hidden animate-fade-in"
      style={{ height: '480px' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/20 to-accent/10 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-base">💬</div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-bg-card" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-1">{t('livehelp.title')}</p>
            <p className="text-[10px] text-green-400">{t('livehelp.online')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 2 && (
            <button
              onClick={summarize}
              title={t('livehelp.summarizeBtn')}
              className="text-[10px] text-text-3 hover:text-text-1 px-2 py-1 rounded-lg hover:bg-white/5 transition"
            >
              {t('livehelp.summarizeBtn')}
            </button>
          )}
          <button onClick={onClose} className="text-text-3 hover:text-text-1 transition p-1 rounded-lg hover:bg-white/5">
            ✕
          </button>
        </div>
      </div>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs shrink-0 mt-0.5 mr-2">💎</div>
            )}
            <div
              className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary/20 text-text-1 rounded-tr-sm'
                  : m.escalated
                    ? 'bg-amber-500/10 text-text-2 rounded-tl-sm border border-amber-500/25'
                    : 'bg-bg-base text-text-2 rounded-tl-sm border border-white/8'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs shrink-0 mt-0.5 mr-2">💎</div>
            <div className="bg-bg-base border border-white/8 rounded-2xl rounded-tl-sm">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Öneri butonları — sadece ilk mesajdan sonra */}
      {messages.length === 1 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(t(s))}
              className="text-[11px] text-text-3 border border-white/10 rounded-full px-2.5 py-1 hover:border-primary/40 hover:text-text-1 transition"
            >
              {t(s)}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 bg-bg-base border border-white/10 rounded-xl px-3 py-2 focus-within:border-primary/40 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('livehelp.placeholder')}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text-1 placeholder-text-3 resize-none focus:outline-none max-h-24 leading-5"
            style={{ minHeight: '20px' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="shrink-0 w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-bg-deep text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/80 transition"
          >
            ↑
          </button>
        </div>
        <p className="text-[10px] text-text-3/50 text-center mt-1.5">{t('livehelp.disclaimer')}</p>
      </div>
    </div>
  );
}
