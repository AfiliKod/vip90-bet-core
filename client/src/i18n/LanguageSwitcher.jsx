import { useTranslation } from './I18nProvider.jsx';

/**
 * i18n sözleşmesinin kanıtı: bu bileşen yalnızca `useTranslation()` üzerinden
 * render olur, iki dilde de doğru etiketlerle çalışır (bkz. core.test.js).
 * Site genelinde mount etmek U2'nin (tam metin taşıma) kapsamı.
 */
export default function LanguageSwitcher() {
  const { t, locale, setLocale, locales } = useTranslation();
  return (
    <div role="group" aria-label={t('common.languageSwitcher.label')} className="flex gap-1 text-xs">
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={code === locale}
          className={code === locale ? 'font-bold text-primary' : 'text-text-2'}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
