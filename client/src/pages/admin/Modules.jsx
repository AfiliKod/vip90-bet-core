import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import ModuleCard from '../../components/admin/ModuleCard';
import { sportLabel } from '../../utils/sportMeta';

/**
 * Modüller + Modül Ayarları'nın birleşmiş hali (2026-09-10) — eskiden iki ayrı
 * sayfaydı (`/admin/modules` aç/kapa listesi, `/admin/module-settings` detay
 * ayarlar). Artık her modül/provider TEK bir kart: üstte aç/kapa + lisans
 * rozeti (her zaman görünür), altta accordion ile açılan detay ayarlar
 * (dil/kategori/API key vb. — eski `ModuleSettings.jsx`'in section'ları).
 *
 * In-house Oyunlar Provider'ı `MODULE_DEFINITIONS`'ta YOK (M1 çekirdek platform,
 * hiçbir modül tarafından kapatılamaz) — bu yüzden kendi kartı toggle'sız,
 * "Çekirdek" rozetiyle gösterilir.
 *
 * Tüm metinler `t('admin.moduleCards.*')` üzerinden (bkz. i18n/dictionaries/) —
 * server'dan gelen modül title/description'ı (registry.js) KASITLI OLARAK
 * kullanılmıyor, o tek dilde (Türkçe) sabit; MODULE_VIEW'daki id eşlemesiyle
 * client-side çevrilebilir sabit metne düşülüyor.
 */

const LANGUAGE_OPTIONS = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'İngilizce' },
  { code: 'de', label: 'Almanca' },
  { code: 'es', label: 'İspanyolca' },
  { code: 'pt', label: 'Portekizce' },
  { code: 'ja', label: 'Japonca' },
  { code: 'ko', label: 'Korece' },
  { code: 'th', label: 'Tayca' },
];

const CURRENCY_OPTIONS = [
  { code: 'TRY', label: 'Türk Lirası (₺)' },
  { code: 'USD', label: 'Dolar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
];

function Chip({ children, tone = 'default' }) {
  const cls = tone === 'default'
    ? 'bg-white/5 border-white/10 text-text-2'
    : 'bg-primary/15 border-primary/30 text-primary';
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

function MultiCheck({ options, selected, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = selected.includes(opt.code ?? opt.id);
        const key = opt.code ?? opt.id;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition disabled:opacity-40 ${
              active
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-white/5 border-white/10 text-text-3 hover:border-white/20'
            }`}
          >
            {opt.flag ? `${opt.flag} ` : ''}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CopyBox({ label, value, warning, copiedLabel }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <div className="text-xs font-semibold text-amber-300 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-black/30 px-2 py-1.5 rounded break-all text-text-1">{value}</code>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-xs px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 transition shrink-0"
        >
          {copied ? `${copiedLabel} ✓` : copiedLabel}
        </button>
      </div>
      {warning && <p className="text-xs text-amber-300/80 mt-2">{warning}</p>}
    </div>
  );
}

// ─── In-house Oyunlar Provider (M1 çekirdek, registry'de yok) ──────────────
function InhouseProviderBody() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/inhouse-provider/settings');
      setSettings(data);
    } catch {
      addToast(t('admin.moduleCards.inhouseLoadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => { load(); }, [load]);

  async function save(patch) {
    setSaving(true);
    try {
      const { data } = await api.patch('/admin/inhouse-provider/settings', patch);
      setSettings(data);
      addToast(t('admin.moduleCards.inhouseUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleLanguage(code) {
    if (!settings) return;
    const has = settings.supportedLanguages.includes(code);
    if (has && settings.supportedLanguages.length === 1) return; // en az 1 dil kalmalı
    const next = has
      ? settings.supportedLanguages.filter(c => c !== code)
      : [...settings.supportedLanguages, code];
    save({ supportedLanguages: next });
  }

  function toggleCurrency(code) {
    if (!settings) return;
    const has = settings.supportedCurrencies.includes(code);
    if (has && settings.supportedCurrencies.length === 1) return;
    const next = has
      ? settings.supportedCurrencies.filter(c => c !== code)
      : [...settings.supportedCurrencies, code];
    save({ supportedCurrencies: next });
  }

  async function doRotate() {
    setRotating(true);
    try {
      const { data } = await api.post('/admin/inhouse-provider/rotate-key');
      setNewKey(data);
      setConfirmRotate(false);
      addToast(t('admin.moduleCards.keyGenerated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.keyGenerateFailed'), 'error');
    } finally {
      setRotating(false);
    }
  }

  if (!settings) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  return (
    <>
      <p className="text-text-3 text-sm mb-4">{t('admin.moduleCards.inhouseDesc')}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.moduleCards.apiKeyId')}</div>
          <code className="text-xs bg-black/30 px-2 py-1.5 rounded block text-text-1">{settings.apiKeyId}</code>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.moduleCards.allowedGames', { count: settings.allowedGameIds.length })}</div>
          <div className="flex flex-wrap gap-1">
            {settings.allowedGameIds.map(id => <Chip key={id}>{id}</Chip>)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">
          {t('admin.moduleCards.supportedLanguagesDefault')} <span className="text-primary">{settings.defaultLanguage}</span>
        </div>
        <MultiCheck options={LANGUAGE_OPTIONS} selected={settings.supportedLanguages} onToggle={toggleLanguage} disabled={saving} />
        {settings.supportedLanguages.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {settings.supportedLanguages.map(code => (
              <button
                key={code}
                type="button"
                disabled={saving || code === settings.defaultLanguage}
                onClick={() => save({ defaultLanguage: code })}
                className={`text-[11px] px-2 py-1 rounded border transition disabled:cursor-default ${
                  code === settings.defaultLanguage
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-white/5 border-white/10 text-text-3 hover:border-white/20'
                }`}
              >
                {code === settings.defaultLanguage ? '✓ ' : ''}{t('admin.moduleCards.setDefault', { code })}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">
          {t('admin.moduleCards.supportedCurrenciesDefault')} <span className="text-primary">{settings.defaultCurrency}</span>
        </div>
        <MultiCheck options={CURRENCY_OPTIONS} selected={settings.supportedCurrencies} onToggle={toggleCurrency} disabled={saving} />
        {settings.supportedCurrencies.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {settings.supportedCurrencies.map(code => (
              <button
                key={code}
                type="button"
                disabled={saving || code === settings.defaultCurrency}
                onClick={() => save({ defaultCurrency: code })}
                className={`text-[11px] px-2 py-1 rounded border transition disabled:cursor-default ${
                  code === settings.defaultCurrency
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-white/5 border-white/10 text-text-3 hover:border-white/20'
                }`}
              >
                {code === settings.defaultCurrency ? '✓ ' : ''}{t('admin.moduleCards.setDefault', { code })}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-white/8">
        {!confirmRotate ? (
          <button
            type="button"
            onClick={() => setConfirmRotate(true)}
            className="text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition"
          >
            {t('admin.moduleCards.generateNewKey')}
          </button>
        ) : (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-300 mb-2">{t('admin.moduleCards.rotateConfirm')}</p>
            <div className="flex gap-2">
              <button onClick={doRotate} disabled={rotating} className="text-xs px-3 py-1.5 rounded bg-red-500/80 hover:bg-red-500 text-white transition disabled:opacity-50">
                {rotating ? t('admin.moduleCards.generating') : t('admin.moduleCards.confirmGenerate')}
              </button>
              <button onClick={() => setConfirmRotate(false)} className="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 transition">{t('admin.moduleCards.giveUp')}</button>
            </div>
          </div>
        )}
        {newKey && (
          <CopyBox
            label={t('admin.moduleCards.newApiSecretLabel', { id: newKey.apiKeyId })}
            value={newKey.apiKeySecret}
            warning={newKey.warning}
            copiedLabel={t('common.copied') || 'Kopyalandı'}
          />
        )}
      </div>
    </>
  );
}

// ─── Bahis Verisi (Odds Provider) ──────────────────────────────────────────
function OddsProviderBody() {
  const { t, locale } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [lastPush, setLastPush] = useState(null);
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

  function fillRandomToken() {
    setTokenInput(Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''));
  }

  async function applyToken() {
    if (!tokenInput || tokenInput.length < 16) {
      addToast(t('admin.moduleCards.tokenTooShort'), 'error');
      return;
    }
    setApplying(true);
    try {
      const { data } = await api.post('/admin/odds-provider/token', { token: tokenInput });
      setLastPush(data);
      setTokenInput('');
      load();
      addToast(data.pushed ? t('admin.moduleCards.tokenSavedPushed') : t('admin.moduleCards.tokenSavedNotPushed'), data.pushed ? 'success' : 'error');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.saveFailed'), 'error');
    } finally {
      setApplying(false);
    }
  }

  async function retryPush() {
    setApplying(true);
    try {
      const { data } = await api.post('/admin/odds-provider/token/retry-push');
      setLastPush(data);
      addToast(data.pushed ? t('admin.moduleCards.pushed') : t('admin.moduleCards.stillUnreachable'), data.pushed ? 'success' : 'error');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.retryFailed'), 'error');
    } finally {
      setApplying(false);
    }
  }

  if (!settings) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  return (
    <>
      <p className="text-text-3 text-sm mb-4">{t('admin.moduleCards.oddsDesc')}</p>

      <div className="mt-4">
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

      <div className="mt-5 pt-4 border-t border-white/8">
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

      <div className="mt-5 pt-4 border-t border-white/8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-wide text-text-3">{t('admin.moduleCards.tokenStatus')}</span>
          {settings.tokenConfigured ? (
            <Chip>{t('admin.moduleCards.configuredOnServer')}</Chip>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/30">{t('admin.moduleCards.notConfigured')}</span>
          )}
        </div>

        {lastPush && !lastPush.pushed && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 mb-3">
            <p className="text-xs text-red-300 mb-2">{lastPush.message || t('admin.moduleCards.unreachableGeneric')}</p>
            <button
              type="button"
              onClick={retryPush}
              disabled={applying}
              className="text-xs px-3 py-1.5 rounded bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
            >
              {applying ? t('admin.moduleCards.retrying') : t('admin.moduleCards.retryPush')}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('admin.moduleCards.newTokenPlaceholder')}
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 font-mono"
          />
          <button
            type="button"
            onClick={fillRandomToken}
            className="text-xs px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-text-2 hover:border-white/20 transition shrink-0"
          >
            {t('admin.moduleCards.randomButton')}
          </button>
        </div>
        <button
          type="button"
          onClick={applyToken}
          disabled={applying || !tokenInput}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition disabled:opacity-40"
        >
          {applying ? t('admin.moduleCards.applying') : t('admin.moduleCards.saveAndApply')}
        </button>
        <p className="text-xs text-text-3 mt-1">{t('admin.moduleCards.tokenSaveHelp')}</p>
      </div>
    </>
  );
}

// ─── Palace Casino ──────────────────────────────────────────────────────────
function PalaceModuleBody() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [language, setLanguage] = useState('tr');
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credStatus, setCredStatus] = useState(null);
  const [credForm, setCredForm] = useState({ apiToken: '', apiBase: '', callbackToken: '' });
  const [savingCreds, setSavingCreds] = useState(false);

  const loadCredStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/palace/credentials');
      setCredStatus(data);
      setCredForm(f => ({ ...f, apiBase: f.apiBase || data.apiBase || '' }));
    } catch {
      addToast(t('admin.moduleCards.palaceCredLoadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => { loadCredStatus(); }, [loadCredStatus]);

  async function saveCredentials() {
    const patch = {};
    if (credForm.apiToken) patch.apiToken = credForm.apiToken;
    if (credForm.apiBase) patch.apiBase = credForm.apiBase;
    if (credForm.callbackToken) patch.callbackToken = credForm.callbackToken;
    if (!Object.keys(patch).length) return;
    setSavingCreds(true);
    try {
      const { data } = await api.patch('/admin/palace/credentials', patch);
      setCredStatus(data);
      setCredForm({ apiToken: '', apiBase: data.apiBase || '', callbackToken: '' });
      addToast(t('admin.moduleCards.palaceCredUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSavingCreds(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, catalogRes] = await Promise.all([
          api.get('/admin/palace/module-settings'),
          api.post('/palace/game/all', { lang: 'tr' }).catch(() => ({ data: { data: [] } })),
        ]);
        setLanguage(settingsRes.data.language || 'tr');
        setSelectedCodes(settingsRes.data.popularGameCodes || []);
        setCatalog(catalogRes.data?.data || []);
      } catch {
        addToast(t('admin.moduleCards.palaceLoadFailed'), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast, t]);

  async function saveLanguage(lang) {
    setLanguage(lang);
    setSaving(true);
    try {
      await api.patch('/admin/palace/module-settings', { language: lang });
      addToast(t('admin.moduleCards.palaceLangUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleGame(code) {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  function moveGame(code, dir) {
    setSelectedCodes(prev => {
      const idx = prev.indexOf(code);
      const next = [...prev];
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  async function savePopularGames() {
    setSaving(true);
    try {
      await api.patch('/admin/palace/module-settings', { popularGameCodes: selectedCodes });
      addToast(t('admin.moduleCards.popularGamesUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const filteredCatalog = catalog.filter(g =>
    !search || g.game_name?.toLowerCase().includes(search.toLowerCase()) || g.game_code?.includes(search)
  ).slice(0, 60);

  const byCode = new Map(catalog.map(g => [g.game_code, g]));

  if (loading) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  return (
    <>
      <p className="text-text-3 text-sm mb-4">{t('admin.moduleCards.palaceDesc')}</p>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.moduleCards.defaultLangOverride')}</div>
        <select
          value={language}
          disabled={saving}
          onChange={e => saveLanguage(e.target.value)}
          className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
        >
          {LANGUAGE_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      <div className="mt-5 pt-4 border-t border-white/8">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-2">{t('admin.moduleCards.apiConnection')}</div>
        {credStatus && (
          <div className="flex flex-wrap gap-2 mb-3">
            {credStatus.apiTokenConfigured ? <Chip>{t('admin.moduleCards.apiTokenConfigured')}</Chip> : (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/30">{t('admin.moduleCards.apiTokenNotConfigured')}</span>
            )}
            {credStatus.callbackTokenConfigured ? <Chip>{t('admin.moduleCards.callbackTokenConfigured')}</Chip> : (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/30">{t('admin.moduleCards.callbackTokenNotConfigured')}</span>
            )}
          </div>
        )}
        <div className="space-y-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-3 mb-1 block">{t('admin.moduleCards.apiToken')}</label>
            <input
              type="password"
              placeholder={credStatus?.apiTokenConfigured ? t('admin.moduleCards.enterNewValue') : t('admin.moduleCards.enterApiToken')}
              value={credForm.apiToken}
              onChange={e => setCredForm(f => ({ ...f, apiToken: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-3 mb-1 block">{t('admin.moduleCards.apiBaseUrl')}</label>
            <input
              type="text"
              placeholder="https://api.casino-provider.example"
              value={credForm.apiBase}
              onChange={e => setCredForm(f => ({ ...f, apiBase: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-text-3 mb-1 block">{t('admin.moduleCards.callbackToken')}</label>
            <input
              type="password"
              placeholder={credStatus?.callbackTokenConfigured ? t('admin.moduleCards.enterNewValue') : t('admin.moduleCards.enterCallbackToken')}
              value={credForm.callbackToken}
              onChange={e => setCredForm(f => ({ ...f, callbackToken: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={saveCredentials}
          disabled={savingCreds || (!credForm.apiToken && !credForm.apiBase && !credForm.callbackToken)}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition disabled:opacity-40"
        >
          {savingCreds ? t('admin.moduleCards.saving') : t('admin.moduleCards.saveApiInfo')}
        </button>
        <p className="text-xs text-text-3 mt-1">{t('admin.moduleCards.emptyFieldHelp')}</p>
      </div>

      <div className="mt-5 pt-4 border-t border-white/8">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wide text-text-3">
            {t('admin.moduleCards.popularGames', { count: selectedCodes.length })}
          </div>
          <button
            onClick={savePopularGames}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition disabled:opacity-50"
          >
            {saving ? t('admin.moduleCards.saving') : t('admin.moduleCards.saveList')}
          </button>
        </div>

        {selectedCodes.length > 0 && (
          <div className="mb-3 space-y-1">
            {selectedCodes.map((code, i) => (
              <div key={code} className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
                <span className="text-text-3 w-5">{i + 1}.</span>
                <span className="flex-1 truncate text-text-1">{byCode.get(code)?.game_name || code}</span>
                <button onClick={() => moveGame(code, -1)} disabled={i === 0} className="text-text-3 hover:text-text-1 disabled:opacity-20 px-1">↑</button>
                <button onClick={() => moveGame(code, 1)} disabled={i === selectedCodes.length - 1} className="text-text-3 hover:text-text-1 disabled:opacity-20 px-1">↓</button>
                <button onClick={() => toggleGame(code)} className="text-red-300 hover:text-red-200 px-1">✕</button>
              </div>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder={t('admin.moduleCards.searchGame')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 mb-2"
        />
        <div className="max-h-64 overflow-y-auto space-y-1 border border-white/8 rounded-lg p-2">
          {filteredCatalog.length === 0 && <div className="text-text-3 text-xs p-2">{t('admin.moduleCards.noResults')}</div>}
          {filteredCatalog.map(g => (
            <label key={g.game_code} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCodes.includes(g.game_code)}
                onChange={() => toggleGame(g.game_code)}
                className="accent-primary"
              />
              <span className="text-text-1">{g.game_name || g.game_code}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── KYC Kimlik Doğrulama ────────────────────────────────────────────────────
function KycSettingsBody() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/kyc-settings');
      setSettings(data.settings);
    } catch {
      addToast(t('admin.moduleCards.kycLoadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => { load(); }, [load]);

  const byKey = Object.fromEntries((settings || []).map(s => [s.key, s]));

  async function saveSetting(key, value) {
    setSaving(true);
    try {
      await api.put('/admin/kyc-settings', { settings: { [key]: value } });
      load();
      addToast(t('admin.moduleCards.kycUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveAllSumsub(partial) {
    setSaving(true);
    try {
      await api.put('/admin/kyc-settings', { settings: partial });
      load();
      addToast(t('admin.moduleCards.sumsubUpdated'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.updateFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      await api.post('/admin/kyc-settings/test');
      addToast(t('admin.moduleCards.sumsubConnSuccess'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error || t('admin.moduleCards.testFailed'), 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!settings) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  const kycEnabled = byKey.KYC_ENABLED?.rawValue !== 'false';
  const provider = byKey.KYC_PROVIDER?.rawValue || 'manual';

  return (
    <>
      <p className="text-text-3 text-sm mb-4">{t('admin.moduleCards.kycDesc')}</p>

      <div className="flex items-center justify-between mb-4 p-3 bg-bg-hover rounded-xl">
        <div>
          <div className="text-sm font-medium text-text-2">{t('admin.moduleCards.kycActive')}</div>
          <div className="text-xs text-text-3">{t('admin.moduleCards.kycActiveHelp')}</div>
        </div>
        <button
          onClick={() => saveSetting('KYC_ENABLED', kycEnabled ? 'false' : 'true')}
          role="switch"
          aria-checked={kycEnabled}
          className={`relative w-12 h-6 rounded-full transition shrink-0 ${kycEnabled ? 'bg-green-500/80' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${kycEnabled ? 'translate-x-6' : ''}`} />
        </button>
      </div>

      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wide text-text-3 mb-2">{t('admin.moduleCards.provider')}</div>
        <div className="flex gap-3">
          {[['manual', t('admin.moduleCards.providerManual')], ['sumsub', t('admin.moduleCards.providerSumsub')]].map(([val, label]) => (
            <label key={val} className="flex-1 flex items-center gap-2 cursor-pointer p-3 bg-bg-hover rounded-xl border border-white/10 has-[:checked]:border-primary/50">
              <input type="radio" name="kycProvider" value={val}
                checked={provider === val}
                onChange={() => saveSetting('KYC_PROVIDER', val)}
                disabled={saving}
                className="w-4 h-4 accent-primary" />
              <span className="text-sm text-text-2">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {provider === 'sumsub' && (
        <div className="mt-4 pt-4 border-t border-white/8">
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-3">{t('admin.moduleCards.sumsubApiSettings')}</div>
          <div className="space-y-3">
            {[
              { key: 'SUMSUB_APP_TOKEN', label: 'App Token', placeholder: 'app_t_' },
              { key: 'SUMSUB_SECRET_KEY', label: 'Secret Key', placeholder: 'sec_' },
              { key: 'SUMSUB_LEVEL_NAME', label: 'Level Name', placeholder: 'basic-kyc-level', secret: false },
              { key: 'SUMSUB_WEBHOOK_SECRET', label: 'Webhook Secret', placeholder: 'whsec_' },
            ].map(({ key, label, placeholder, secret = true }) => {
              const current = byKey[key] || {};
              const source = current.source || 'unset';
              const badgeCls = source === 'db' ? 'bg-green-500/20 text-green-300 border-green-500/30'
                : source === 'env' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                : 'bg-white/5 text-text-3 border-white/10';
              const badgeLabel = source === 'db' ? t('admin.moduleCards.sourcePanel') : source === 'env' ? t('admin.moduleCards.sourceEnv') : t('admin.moduleCards.sourceUnset');
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs font-medium text-text-2">{label}</label>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badgeCls}`}>{badgeLabel}</span>
                  </div>
                  <input
                    type={secret ? 'password' : 'text'}
                    placeholder={source === 'unset' ? placeholder : t('admin.moduleCards.enterNewValueDots')}
                    className="w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
                    onBlur={e => { if (e.target.value) saveAllSumsub({ [key]: e.target.value }); }}
                  />
                </div>
              );
            })}
          </div>
          <button
            onClick={testConnection}
            disabled={testing}
            className="mt-3 text-xs px-3 py-2 rounded-lg border border-white/10 text-text-2 hover:text-text-1 disabled:opacity-40 transition"
          >
            {testing ? t('admin.moduleCards.testing') : t('admin.moduleCards.connectionTest')}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Crypto Ödeme Ağ Geçidi ────────────────────────────────────────────────
function CryptoPaymentBody() {
  const addToast = useToastStore(s => s.add);
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [hotWallet, setHotWallet] = useState(null);

  const load = useCallback(async () => {
    try {
      const [settingsRes, depositsRes, withdrawalsRes, hotWalletRes] = await Promise.all([
        api.get('/crypto/settings'),
        api.get('/admin/crypto/pending-deposits').catch(() => ({ data: [] })),
        api.get('/admin/crypto/pending-withdrawals').catch(() => ({ data: [] })),
        api.get('/crypto/hot-wallet-balance').catch(() => ({ data: null })),
      ]);
      setSettings(settingsRes.data);
      setPendingDeposits(depositsRes.data);
      setPendingWithdrawals(withdrawalsRes.data);
      setHotWallet(hotWalletRes.data);
    } catch {
      addToast('Crypto ayarları alınamadı.', 'error');
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  async function saveSettings(patch) {
    setSaving(true);
    try {
      await api.put('/admin/crypto/settings', patch);
      setSettings(prev => ({ ...prev, ...patch }));
      addToast('Crypto ayarları güncellendi.', 'success');
    } catch (e) {
      addToast(e.response?.data?.error || 'Güncelleme başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approveDeposit(depositId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/deposits/${depositId}/approve`);
      addToast('Yatırma onaylandı.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Onay başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rejectDeposit(depositId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/deposits/${depositId}/reject`);
      addToast('Yatırma reddedildi.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Red başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function approveWithdrawal(withdrawalId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/withdrawals/${withdrawalId}/approve`);
      addToast('Çekim onaylandı — hot wallet\'tan transfer başlatıldı.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Onay başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rejectWithdrawal(withdrawalId) {
    setSaving(true);
    try {
      await api.post(`/admin/crypto/withdrawals/${withdrawalId}/reject`);
      addToast('Çekim reddedildi — bakiye iade edildi.', 'success');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Red başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="text-text-3 text-sm">{t('admin.cryptoPayment.loading')}</div>;

  return (
    <>
      <p className="text-text-3 text-sm mb-4">{t('admin.cryptoPayment.description')}</p>

      {hotWallet && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-semibold text-green-300">{t('admin.cryptoPayment.hotWalletBalance')}</div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              settings.network === 'mainnet' ? 'bg-red-500/20 text-red-300' :
              settings.network === 'nile' ? 'bg-blue-500/20 text-blue-300' :
              'bg-yellow-500/20 text-yellow-300'
            }`}>
              {settings.network === 'mainnet' ? t('admin.cryptoPayment.networkMainnet') :
               settings.network === 'nile' ? t('admin.cryptoPayment.networkNile') :
               t('admin.cryptoPayment.networkShasta')}
            </span>
          </div>
          <div className="text-lg font-bold text-green-200">{hotWallet.usdt?.toFixed(2) || 0} USDT</div>
          <div className="text-xs text-green-300/80 mt-1">{t('admin.cryptoPayment.address')} {hotWallet.address}</div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.cryptoPayment.networkLabel')}</div>
          <select
            value={settings.network || 'mainnet'}
            onChange={e => saveSettings({ network: e.target.value })}
            disabled={saving}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
          >
            <option value="mainnet">{t('admin.cryptoPayment.networkMainnetOption')}</option>
            <option value="shasta">{t('admin.cryptoPayment.networkShastaOption')}</option>
            <option value="nile">{t('admin.cryptoPayment.networkNileOption')}</option>
          </select>
          <div className="text-xs text-yellow-300/80 mt-1">{t('admin.cryptoPayment.networkWarning')}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.cryptoPayment.rateLabel')}</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.usdtTryRate || 1}
              onChange={e => saveSettings({ usdtTryRate: Number(e.target.value) })}
              disabled={saving}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
            />
            <span className="text-xs text-text-3 whitespace-nowrap">{t('admin.cryptoPayment.rateUnit')}</span>
          </div>
          <div className="text-xs text-text-3 mt-1">{t('admin.cryptoPayment.rateHelp', { rate: settings.usdtTryRate || 1 })}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.cryptoPayment.autoDepositThreshold')}</div>
          <input
            type="number"
            value={settings.deposit?.autoCreditLimit || 100}
            onChange={e => saveSettings({ deposit: { ...settings.deposit, autoCreditLimit: Number(e.target.value) } })}
            disabled={saving}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
          />
          <div className="text-xs text-text-3 mt-1">{t('admin.cryptoPayment.autoDepositHelp')}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-3 mb-1.5">{t('admin.cryptoPayment.autoWithdrawThreshold')}</div>
          <input
            type="number"
            value={settings.withdraw?.autoProcessLimit || 15}
            onChange={e => saveSettings({ withdraw: { ...settings.withdraw, autoProcessLimit: Number(e.target.value) } })}
            disabled={saving}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 disabled:opacity-50"
          />
          <div className="text-xs text-text-3 mt-1">{t('admin.cryptoPayment.autoWithdrawHelp')}</div>
        </div>
      </div>

      {pendingDeposits.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/8">
          <div className="text-xs font-semibold text-text-2 mb-2">{t('admin.crypto.deposit')} ({pendingDeposits.length})</div>
          <div className="space-y-2">
            {pendingDeposits.map(d => (
              <div key={d._id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-1">{d.usdtAmount} USDT → {d.creditedTRY} TRY</div>
                  <div className="text-[10px] text-text-3 truncate">tx: {d.txHash?.slice(0, 16)}…</div>
                </div>
                <button
                  onClick={() => approveDeposit(d._id)}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition disabled:opacity-50"
                >
                  {t('admin.crypto.approve')}
                </button>
                <button
                  onClick={() => rejectDeposit(d._id)}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
                >
                  {t('admin.crypto.reject')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingWithdrawals.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/8">
          <div className="text-xs font-semibold text-text-2 mb-2">{t('admin.crypto.withdraw')} ({pendingWithdrawals.length})</div>
          <div className="space-y-2">
            {pendingWithdrawals.map(w => (
              <div key={w._id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-1">{w.usdtAmount} USDT → {w.toAddress?.slice(0, 16)}…</div>
                  <div className="text-[10px] text-text-3">{w.userId?.username || w.userId}</div>
                </div>
                <button
                  onClick={() => approveWithdrawal(w._id)}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition disabled:opacity-50"
                >
                  {t('admin.crypto.approve')}
                </button>
                <button
                  onClick={() => rejectWithdrawal(w._id)}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
                >
                  {t('admin.crypto.reject')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Modül id → kart görünümü (ikon + accordion body + çevrilebilir başlık) ─
const MODULE_VIEW = {
  betting:           { icon: '📊', Body: OddsProviderBody, key: 'betting' },
  'casino-content':  { icon: '🎰', Body: PalaceModuleBody, key: 'casinoContent' },
  'inhouse-games':   { icon: '🎮', Body: InhouseProviderBody, key: 'inhouseGames' },
  'crypto-payment':  { icon: '💰', Body: CryptoPaymentBody, key: 'cryptoPayment' },
  'kyc-verification':{ icon: '🔐', Body: KycSettingsBody, key: 'kycVerification' },
};

export default function AdminModules() {
  const { t } = useTranslation();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const LICENSE_BADGE = {
    live:   { label: t('admin.modules.licenseLive'), cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
    cached: { label: t('admin.modules.licenseCached'), cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    closed: { label: t('admin.modules.licenseClosed'), cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/admin/modules');
      setModules(r.data.modules ?? []);
    } catch {
      setError(t('admin.modules.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function toggle(m) {
    setBusyId(m.id);
    setError('');
    try {
      const r = await api.patch(`/admin/modules/${m.id}`, { enabled: !m.enabled });
      setModules(r.data.modules ?? []);
    } catch {
      setError(t('admin.modules.updateFailed', { title: m.title }));
    } finally {
      setBusyId(null);
    }
  }

  async function refresh() {
    setBusyId('refresh');
    try {
      const r = await api.post('/admin/modules/refresh');
      setModules(r.data.modules ?? []);
    } catch {
      setError(t('admin.modules.refreshFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('admin.modules.title')}</h1>
        <button
          onClick={refresh}
          disabled={busyId === 'refresh'}
          className="px-4 py-2 rounded-lg bg-bg-card border border-white/10 hover:border-primary/40 transition text-sm disabled:opacity-50"
        >
          {busyId === 'refresh' ? t('admin.modules.refreshing') : t('admin.modules.refreshButton')}
        </button>
      </div>

      <p className="text-text-3 text-sm mb-6">
        {t('admin.modules.hint')}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-text-3">{t('common.loading')}</div>
      ) : (
        <>
          {modules.map(m => {
            const badgeInfo = LICENSE_BADGE[m.licenseSource] ?? LICENSE_BADGE.closed;
            const view = MODULE_VIEW[m.id];
            // Server tek dilde (TR) sabit title/description döner — client-side
            // bilinen modül id'leri için çevrilebilir sabit metne düşülür.
            // NOT: i18n anahtarları tire (-) kabul etmez (bkz. core.js assertValidKey),
            // bu yüzden modül id'si DEĞİL, MODULE_VIEW'daki camelCase `key` kullanılır.
            const title = view ? t(`admin.moduleCards.title.${view.key}`) : m.title;
            const description = view ? t(`admin.moduleCards.desc.${view.key}`) : m.description;
            return (
              <ModuleCard
                key={m.id}
                icon={view?.icon ?? '🧩'}
                title={title}
                description={description}
                enabled={m.enabled}
                onToggle={() => toggle(m)}
                toggleBusy={busyId === m.id}
                coreLabel={t('admin.moduleCards.coreBadge')}
                badge={
                  <>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeInfo.cls}`}>
                      {badgeInfo.label}
                    </span>
                    {m.enabled && !m.licensed && (
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/30">
                        {t('admin.modules.unlicensed')}
                      </span>
                    )}
                  </>
                }
              >
                {view ? <view.Body /> : (
                  <p className="text-text-3 text-sm">{t('admin.moduleCards.noSettingsScreen')}</p>
                )}
              </ModuleCard>
            );
          })}
        </>
      )}
    </div>
  );
}
