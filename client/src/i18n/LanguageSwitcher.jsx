import { useTranslation } from './I18nProvider.jsx';

/**
 * i18n sözleşmesinin kanıtı: bu bileşen yalnızca `useTranslation()` üzerinden
 * render olur, iki dilde de doğru etiketlerle çalışır (bkz. core.test.js).
 * Site genelinde mount etmek U2'nin (tam metin taşıma) kapsamı.
 *
 * Buton grubu yerine `<select>`: ileride daha fazla dil eklendiğinde
 * (`i18n/dictionaries/` altına yeni bir dosya + `index.js`'e kayıt) bu
 * bileşende hiçbir değişiklik gerekmez, `locales` dizisi büyüdükçe
 * dropdown kendiliğinden büyür.
 */
export default function LanguageSwitcher() {
  const { t, locale, setLocale, locales } = useTranslation();
  return (
    <select
      aria-label={t('common.languageSwitcher.label')}
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      className="bg-transparent text-xs font-bold text-text-2 hover:text-text-1 border border-white/10 rounded-md px-1.5 py-1 cursor-pointer focus:outline-none focus:border-primary/40"
    >
      {locales.map((code) => (
        <option key={code} value={code} className="bg-bg-card text-text-1">
          {code.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
