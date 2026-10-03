// Ürün sayfalarından Settings → Modules (bağlantı ayarları) sekmesine kısayol.
import { Link } from 'react-router-dom';
import { useTranslation } from '../../../i18n';

export default function ConnectionSettingsLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/admin/platform?tab=modules"
      className="inline-flex items-center gap-1 text-xs font-semibold text-text-3 transition hover:text-text-1"
    >
      {t('admin.productLinks.connectionSettings')}
      <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">arrow_forward</span>
    </Link>
  );
}
