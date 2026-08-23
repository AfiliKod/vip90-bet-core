import { useEffect, useState } from 'react';
import { usePWA } from '../hooks/usePWA.js';
import api from '../services/api';

export function PWAUpdateBanner() {
  const { updateAvailable, applyUpdate, isOnline } = usePWA();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (updateAvailable) setVisible(true);
  }, [updateAvailable]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-cyan-600 text-white px-4 py-3 flex items-center justify-between shadow-lg animate-slide-down" role="alert">
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
        </svg>
        <span className="text-sm font-medium">Yeni sürüm mevcut!</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { applyUpdate(); setVisible(false); }}
          className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-sm font-medium transition-colors"
        >
          Güncelle
        </button>
        <button
          onClick={() => setVisible(false)}
          className="p-1.5 hover:bg-white/20 rounded transition-colors"
          aria-label="Kapat"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function OnlineStatusIndicator() {
  const { isOnline } = usePWA();
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await api.get('/health/status');
        if (!cancelled && typeof data.onlineCount === 'number') setOnlineCount(data.onlineCount);
      } catch {
        // sunucu erişilemezse mevcut değeri koru
      }
    }
    poll();
    const interval = setInterval(poll, 10000);

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
      isOnline ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
    }`}>
      <span className={`w-2 h-2 rounded-full animate-pulse ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
      <span>{onlineCount.toLocaleString()} çevrimiçi</span>
      <span className="opacity-50">|</span>
      <span>PWA</span>
    </div>
  );
}