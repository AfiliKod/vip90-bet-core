// In-house Games sayfası: izin verilen oyunlar (salt okunur liste).
// Eskiden Modules.jsx > InhouseProviderBody içindeydi; API anahtarı ve
// desteklenen dil/para birimi Modules'ta kalır.
import { useEffect, useState } from 'react';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToastStore } from '../../../store/toastStore';
import { Chip } from './AdminChoice.jsx';

export default function InhouseAllowedGames() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [ids, setIds] = useState(null);

  useEffect(() => {
    let off = false;
    api.get('/admin/inhouse-provider/settings')
      .then(({ data }) => { if (!off) setIds(data.allowedGameIds || []); })
      .catch(() => { if (!off) { setIds([]); addToast(t('admin.moduleCards.inhouseLoadFailed'), 'error'); } });
    return () => { off = true; };
  }, [addToast, t]);

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
      {ids === null ? (
        <div className="text-text-3 text-sm">{t('common.loading')}</div>
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">
            {t('admin.moduleCards.allowedGames', { count: ids.length })}
          </div>
          <div className="flex flex-wrap gap-1">
            {ids.map(id => <Chip key={id}>{id}</Chip>)}
          </div>
        </>
      )}
    </div>
  );
}
