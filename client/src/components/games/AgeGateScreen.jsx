import { useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

/**
 * 18+ onay ekranı (2026-10-08).
 *
 * Sunucu, onay kaydı olmayan hesaplar için oyun açılışını
 * `403 AGE_CONFIRMATION_REQUIRED` ile reddeder (bkz.
 * server/src/middleware/ageGate.js). Bu ekran o kapının açılmasını sağlar:
 * tek tık beyan (`confirmed`) `ageConfirmedAt` yazar; doğum tarihi girilirse
 * 18 yaş kontrolü yapılıp `ageVerifiedAt` de yazılır.
 *
 * Doğum tarihi girilip 18 yaş altı çıkarsa onay kaydedilmez ve hata mesajı
 * gösterilir (sunucu 422 AGE_NOT_ELIGIBLE döner) — kapı atlanamaz.
 */
export default function AgeGateScreen({ onConfirmed, gameName }) {
  const { t } = useTranslation();
  const [showDob, setShowDob] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/age-confirm', {
        confirmed: true,
        ...(showDob && dateOfBirth ? { dateOfBirth } : {}),
      });
      onConfirmed?.();
    } catch (err) {
      const code = err.response?.data?.code;
      setError(
        code === 'AGE_NOT_ELIGIBLE'
          ? t('ageGate.notEligible')
          : err.response?.data?.error || t('ageGate.failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-deep px-6 gap-5">
      <div className="text-4xl">🔞</div>
      <div className="text-center space-y-2 max-w-md">
        <h1 className="text-white text-lg font-bold">{t('ageGate.title')}</h1>
        <p className="text-text-3 text-sm leading-relaxed">
          {gameName ? t('ageGate.subtitleNamed', { name: gameName }) : t('ageGate.subtitle')}
        </p>
      </div>

      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-3">
        {showDob && (
          <input
            type="date"
            value={dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateOfBirth(e.target.value)}
            aria-label={t('ageGate.dobLabel')}
            className="w-full px-4 py-3 rounded-lg bg-bg-card border border-white/10 text-white text-sm focus:border-primary outline-none"
          />
        )}

        {error && (
          <p role="alert" className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || (showDob && !dateOfBirth)}
          className="w-full py-3 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition"
        >
          {busy ? t('ageGate.working') : t('ageGate.confirm')}
        </button>

        <button
          type="button"
          onClick={() => setShowDob((v) => !v)}
          className="text-text-3 text-xs underline hover:text-text-1 transition"
        >
          {showDob ? t('ageGate.skipDob') : t('ageGate.addDob')}
        </button>
      </form>
    </div>
  );
}