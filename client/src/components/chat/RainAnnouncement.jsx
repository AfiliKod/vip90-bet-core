import { useTranslation } from '../../i18n';

export default function RainAnnouncement({ event, onDismiss }) {
  const { t } = useTranslation();
  if (!event) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-max max-w-[92vw]">
      <div className="flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl bg-bg-card/95 border border-neon-cyan/30 shadow-lg shadow-neon-cyan/10 animate-balloon">
        <span className="text-2xl animate-float" aria-hidden="true">
          🌧️
        </span>
        <div className="min-w-0">
          <p className="text-xs text-text-2 truncate">
            {t('rain.announcement', { amount: event.totalAmount, count: event.recipientCount })}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label={t('common.cancel')}
            className="ml-1 w-6 h-6 rounded-md text-text-3 hover:text-text-1 hover:bg-bg-hover flex items-center justify-center transition"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
