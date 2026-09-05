import { useState, useEffect } from 'react';
import { usePWA } from '../hooks/usePWA.js';
import { useTranslation } from '../i18n';

export function PWAUpdateBanner() {
  const { t } = useTranslation();
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
        <span className="text-sm font-medium">{t('pwa.updateAvailable')}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { applyUpdate(); setVisible(false); }}
          className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-sm font-medium transition-colors"
        >
          {t('common.update')}
        </button>
        <button
          onClick={() => setVisible(false)}
          className="p-1.5 hover:bg-white/20 rounded transition-colors"
          aria-label={t('common.close')}
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
