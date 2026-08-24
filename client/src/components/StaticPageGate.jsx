import { useStaticPage } from '../hooks/useStaticPage';
import { useTranslation } from '../i18n';

/** Statik sayfa (Yasal/Kurumsal) içeriğini çeker; yükleniyor/kapalı durumlarını tek yerden yönetir. */
export default function StaticPageGate({ slug, render }) {
  const { page, status } = useStaticPage(slug);
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#05080f' }}>
        <div className="text-text-3 text-sm">{t('common.loading')}</div>
      </div>
    );
  }

  if (status === 'notfound' || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#05080f' }}>
        <div className="text-text-3 text-sm">{t('staticPage.unavailable')}</div>
      </div>
    );
  }

  return render(page);
}
