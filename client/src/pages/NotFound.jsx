import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { SURFACE_CARD_BG, SURFACE_BORDER } from '../styles/surface';

/**
 * Eşleşmeyen yolların sayfası (App.jsx `*` rotası).
 *
 * HTTP 404'ü SUNUCU verir: `server/src/seo/http.js` rota tablosunda
 * (`client/dist/routes.json`) olmayan bir yola 404 + `X-Robots-Tag: noindex`
 * ile index.html'i servis eder, buradaki sayfa o yanıtı gösterir. Bu sayfa
 * olmadan önce `<Route path="*">` sessizce ana sayfaya yönlendiriyordu
 * (200 dönen, arama motoruna açık, kullanıcıyı yanıltan URL).
 */
export default function NotFound() {
  const { t } = useTranslation();

  // Sunucu bu yanıtta robots meta'sı enjekte etmez; istemcide de noindex bırak.
  useEffect(() => {
    const head = document.head;
    let tag = head.querySelector('meta[name="robots"]');
    const created = !tag;
    if (created) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      head.appendChild(tag);
    }
    const previous = tag.getAttribute('content');
    tag.setAttribute('content', 'noindex, nofollow');
    return () => {
      if (created) tag.remove();
      else if (previous) tag.setAttribute('content', previous);
    };
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{ background: SURFACE_CARD_BG, border: `1px solid ${SURFACE_BORDER}` }}
      >
        <div className="text-5xl font-black text-primary">{t('notFound.code')}</div>
        <h1 className="mt-3 text-xl font-bold text-text-1">{t('notFound.title')}</h1>
        <p className="mt-2 text-sm text-text-2">{t('notFound.description')}</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
        >
          {t('notFound.home')}
        </Link>
      </div>
    </div>
  );
}
