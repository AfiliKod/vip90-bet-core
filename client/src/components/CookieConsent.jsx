import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent } from '../services/consent';
import { useTranslation } from '../i18n';

export default function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefs, setPrefs] = useState({ necessary: true, analytics: false, marketing: false });

  useEffect(() => {
    // İlk ziyaret — banner göster
    const t = setTimeout(() => {
      const existing = getConsent();
      if (!existing) setVisible(true);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  function acceptAll() {
    setPrefs({ necessary: true, analytics: true, marketing: true });
    setConsent({ analytics: true, marketing: true });
    setVisible(false);
  }

  function rejectAll() {
    setPrefs({ necessary: true, analytics: false, marketing: false });
    setConsent({ analytics: false, marketing: false });
    setVisible(false);
  }

  function savePrefs() {
    setConsent(prefs);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4"
      style={{ animation: 'slideUp 0.4s ease-out' }}
    >
      <style>{`\n        @keyframes slideUp {\n          from { transform: translateY(100%); opacity: 0; }\n          to { transform: translateY(0); opacity: 1; }\n        }\n      `}</style>
      <div
        className="max-w-4xl mx-auto rounded-2xl p-4 sm:p-5 shadow-2xl"
        style={{
          background: 'rgba(8, 13, 26, 0.95)',
          border: '1px solid rgba(0,212,255,0.3)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 0 30px rgba(0,212,255,0.2)',
        }}
      >
        {!showDetails ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg">🍪</span>
                <span className="text-sm font-bold text-text-1">{t('cookies.title')}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#8899bb' }}>
                {t('cookies.description')}
                {' '}
                <Link to="/legal/cookies" className="underline" style={{ color: '#00d4ff' }}>{t('cookies.policyLink')}</Link>{' '}
                {t('cookies.learnMore')}.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => setShowDetails(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-text-1 border border-white/10 hover:border-white/20 transition flex-1 sm:flex-initial"
              >
                {t('cookies.customize')}
              </button>
              <button
                onClick={rejectAll}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-text-1 border border-white/10 hover:border-white/20 transition flex-1 sm:flex-initial"
              >
                {t('cookies.rejectAll')}
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 rounded-lg text-xs font-bold text-black flex-1 sm:flex-initial"
                style={{
                  background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                  boxShadow: '0 0 12px #00d4ff55',
                }}
              >
                {t('cookies.acceptAll')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-text-1">{t('cookies.title')}</span>
              <button
                onClick={() => setShowDetails(false)}
                className="text-xs"
                style={{ color: '#8899bb' }}
              >
                ← {t('common.back')}
              </button>
            </div>

            <div className="space-y-2 mb-4">
              <ConsentRow
                title={t('cookies.necessary')}
                desc={t('cookies.necessaryDesc')}
                checked
                disabled
              />
              <ConsentRow
                title={t('cookies.analytics')}
                desc={t('cookies.analyticsDesc')}
                checked={prefs.analytics}
                onChange={v => setPrefs(p => ({ ...p, analytics: v }))}
              />
              <ConsentRow
                title={t('cookies.marketing')}
                desc={t('cookies.marketingDesc')}
                checked={prefs.marketing}
                onChange={v => setPrefs(p => ({ ...p, marketing: v }))}
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={rejectAll}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-text-1 border border-white/10 hover:border-white/20 transition"
              >
                {t('cookies.rejectAll')}
              </button>
              <button
                onClick={savePrefs}
                className="px-4 py-2 rounded-lg text-xs font-bold text-black"
                style={{
                  background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                  boxShadow: '0 0 12px #00d4ff55',
                }}
              >
                {t('cookies.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsentRow({ title, desc, checked, onChange, disabled }) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg ${disabled ? '' : 'cursor-pointer'}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={e => onChange?.(e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer accent-cyan-400"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-text-1">{title}</div>
        <div className="text-[11px] mt-0.5" style={{ color: '#8899bb' }}>{desc}</div>
      </div>
    </label>
  );
}