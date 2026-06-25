import { useState, useCallback } from 'react';

const STYLE = {
  win:  { bg: 'rgba(34,197,94,0.14)',   border: 'rgba(34,197,94,0.30)',   color: '#4ade80', shadow: '0 8px 28px rgba(34,197,94,0.18)' },
  lose: { bg: 'rgba(239,68,68,0.13)',   border: 'rgba(239,68,68,0.26)',   color: '#f87171', shadow: '0 8px 28px rgba(239,68,68,0.15)' },
  info: { bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.14)', color: '#94a3b8', shadow: 'none' },
};

export function useGameNotice() {
  const [notices, setNotices] = useState([]);

  const notify = useCallback((msg, type = 'info', ttl = 3800) => {
    const id = Date.now() + Math.random();
    setNotices(p => [...p.slice(-2), { id, msg, type }]);
    setTimeout(() => setNotices(p => p.filter(n => n.id !== id)), ttl);
  }, []);

  return { notices, notify };
}

export function GameNoticeArea({ notices, className = '', style }) {
  if (!notices.length) return null;
  return (
    <div className={`absolute inset-x-0 bottom-5 flex flex-col items-center gap-2 z-30 pointer-events-none px-8 ${className}`} style={style}>
      {notices.map(n => {
        const s = STYLE[n.type] ?? STYLE.info;
        return (
          <div
            key={n.id}
            className="animate-balloon text-sm font-bold px-5 py-2.5 rounded-2xl text-center"
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              color: s.color,
              backdropFilter: 'blur(18px)',
              boxShadow: s.shadow,
              maxWidth: '88%',
            }}
          >
            {n.msg}
          </div>
        );
      })}
    </div>
  );
}
