import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';

/**
 * Sıfır bakiyeyle bir oyuna girilmeye çalışıldığında gösterilen ekran.
 * Dış sağlayıcı oyunları (IgamesGame) ve in-house oyunlar
 * (InhouseGameLauncher) aynı ekranı kullanır — önceden yalnızca dış
 * sağlayıcıda vardı, in-house oyun açılıp ancak bahiste reddediliyordu.
 */
export default function InsufficientBalanceScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-deep gap-5 px-6">
      <div className="text-6xl">💸</div>
      <div className="text-center max-w-sm">
        <p className="text-white text-lg font-bold mb-2">{t('igamesGame.insufficientBalanceTitle')}</p>
        <p className="text-text-3 text-sm">
          {t('igamesGame.insufficientBalanceDesc')}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <button
          onClick={() => navigate('/profile?mode=deposit&method=bank')}
          className="flex-1 px-5 py-3 rounded-xl text-sm font-bold text-black shadow-lg"
          style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)', boxShadow: '0 0 20px #00d4ff55' }}
        >
          💰 {t('igamesGame.deposit')}
        </button>
        <button
          onClick={() => navigate('/casino')}
          className="flex-1 px-5 py-3 rounded-xl text-sm font-semibold text-text-2 border border-white/10 hover:text-text-1 transition"
        >
          ← {t('igamesGame.backToCasino')}
        </button>
      </div>
    </div>
  );
}
