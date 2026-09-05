import { useEffect } from 'react';
import { useModuleStore } from '../store/moduleStore';
import { useTranslation } from '../i18n';

/**
 * M4 — Route seviyesinde zarif bozulma kapısı.
 *
 * Modül kapalıysa ilgili sayfa yerine nazik bir bilgilendirme gösterilir;
 * site hatasız çalışmaya devam eder.
 * Sunucu gate'leri (503 MODULE_DISABLED) asıl zorlamayı yapar; bu bileşen
 * yalnızca sunumdur.
 */
export default function ModuleGate({ module: moduleId, children }) {
  const { t } = useTranslation();
  const available = useModuleStore(s => s.available[moduleId] !== false);
  const fetch = useModuleStore(s => s.fetch);
  const loaded = useModuleStore(s => s.loaded);

  useEffect(() => {
    if (!loaded) fetch();
  }, [loaded, fetch]);

  if (available) return children;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-bg-card border border-white/10 rounded-2xl p-8">
        <div className="text-4xl mb-3">🚧</div>
        <h2 className="text-xl font-bold mb-2">{t('moduleGate.title')}</h2>
        <p className="text-text-3 text-sm">{t('moduleGate.description')}</p>
      </div>
    </div>
  );
}
