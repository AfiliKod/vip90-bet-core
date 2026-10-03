// Sportsbook → Categories: aktif spor kategorileri + öncelikli spor/ülke.
// Eskiden Modules.jsx > OddsProviderBody içindeydi; sunucu uçları aynı
// (`/admin/odds-provider/settings`). Odds token Modules'ta kalır.
import { useEffect, useState, useCallback } from 'react';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToastStore } from '../../../store/toastStore';
import { sportLabel } from '../../../utils/sportMeta';
import { MultiCheck } from './AdminChoice.jsx';

export default function OddsCategoriesSettings() {
  const { t, locale } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [countryOptions, setCountryOptions] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/odds-provider/settings');
      setSettings(data);
    } catch {
      addToast(t('admin.moduleCards.oddsLoadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => { load(); }, [load]);

  // Öncelikli ülke dropdown'ı seçilen spora göre — Event.country serbest metin
  // olduğundan (ISO kodu değil) yazım hatasına açık bir text input yerine
  // kaynakta GERÇEKTEN var olan değerleri gösteriyoruz.
  useEffect(() => {
    if (!settings?.prioritySport) return;
    api.get('/events/countries', { params: { sport: settings.prioritySport } })
      .then(({ data }) => setCountryOptions(data.countries || []))
      .catch(() => setCountryOptions([]));
  }, [settings?.prioritySport]);

  async function save(patch) {
    setSaving(true);
    try {
      const { data } = await api.patch('/admin/odds-provider/settings', patch);
      setSettings(data);
      addToast(t('admin.moduleCards.oddsUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(id) {
    if (!settings) return;
    const has = settings.enabledCategories.includes(id);
    const next = has
      ? settings.enabledCategories.filter(c => c !== id)
      : [...settings.enabledCategories, id];
    save({ enabledCategories: next });
  }

  if (!settings) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  return (
    <div className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">
          {t('admin.moduleCards.activeCategories', { count: settings.enabledCategories.length, total: settings.availableCategories.length })}
        </div>
        <MultiCheck
          options={settings.availableCategories.map(c => ({ ...c, label: sportLabel(c.id, locale) }))}
          selected={settings.enabledCategories}
          onToggle={toggleCategory}
          disabled={saving}
        />
      </div>

      <div className="mt-5 pt-4 border-t border-white/10">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-2">
          {t('admin.moduleCards.priorityDisplay')}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-3 mb-1 block">{t('admin.moduleCards.prioritySport')}</label>
            <select
              value={settings.prioritySport || 'football'}
              disabled={saving}
              onChange={e => save({ prioritySport: e.target.value })}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
            >
              {settings.availableCategories.map(c => <option key={c.id} value={c.id}>{c.flag} {sportLabel(c.id, locale)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-3 mb-1 block">{t('admin.moduleCards.priorityCountry')}</label>
            <select
              value={settings.priorityCountry || 'Turkey'}
              disabled={saving}
              onChange={e => save({ priorityCountry: e.target.value })}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
            >
              {!countryOptions.includes(settings.priorityCountry) && settings.priorityCountry && (
                <option value={settings.priorityCountry}>{settings.priorityCountry}</option>
              )}
              {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-text-3 mt-1">{t('admin.moduleCards.priorityHelp')}</p>
      </div>
    </div>
  );
}
