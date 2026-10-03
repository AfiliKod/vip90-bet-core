import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from '../../i18n';
import { ADMIN_BTN, ADMIN_BTN_GHOST, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';

/**
 * U4/U5 — Bölge ve para birimi kartı.
 *
 * U4: currency/index.js'teki servis katmanı (setActiveCurrency) zaten
 * vardı, yalnızca admin HTTP ucu eksikti (bkz. controllers/admin.js).
 * U5: services/timezone.js + timezoneLive.js tam bağlıydı, yalnızca bu
 * arayüz eksikti (RAPOR.md'de "U4 paralelinde... bilerek dokunulmadı"
 * notuyla kapsam dışı bırakılmıştı).
 *
 * Para birimi değişikliği yalnızca GÖRÜNTÜLEME biçimini değiştirir —
 * client/src/utils/money.js'in formatMoney'i hiçbir kur dönüşümü
 * yapmıyor, aynı ham sayıyı farklı sembol/locale ile gösteriyor. Bu,
 * operatörün yanlış anlamaması için bilgi kutusunda açıkça belirtiliyor.
 *
 * 2026-09-10: "Varsayılan Dil" alanı eklendi — bu, `PanelLanguageCard`'ın
 * (aşağıda) değiştirdiği "BU admin'in KENDİ panel dili" ile KARIŞTIRILMAMALI.
 * Buradaki, `localStorage`'da HİÇ dil seçimi olmayan (ilk ziyaretçi)
 * kullanıcıların göreceği SİTE GENELİ varsayılanı — `services/locale.js`,
 * `GET/PUT /admin/settings/default-locale`. Kullanıcı navbar'dan kendi
 * dilini seçtiği an bu varsayılan bir daha hiç devreye girmez (bkz.
 * I18nProvider.jsx `hasStoredChoice`).
 */
function RegionCurrencyCard({ t }) {
  const [currency, setCurrency] = useState(null);
  const [timezone, setTimezone] = useState('');
  const [tzInput, setTzInput] = useState('');
  const [defaultLocale, setDefaultLocale] = useState('tr');
  const [supportedLocales, setSupportedLocales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/currency'),
      api.get('/admin/settings/timezone'),
      api.get('/admin/settings/default-locale'),
    ])
      .then(([currencyRes, tzRes, localeRes]) => {
        setCurrency(currencyRes.data);
        setTimezone(tzRes.data.timezone);
        setTzInput(tzRes.data.timezone);
        setDefaultLocale(localeRes.data.locale);
        setSupportedLocales(localeRes.data.supportedLocales || []);
      })
      .catch(() => setNotice({ type: 'error', text: t('admin.settings.loadFailed') }))
      .finally(() => setLoading(false));
  }, [t]);

  async function saveDefaultLocale(code) {
    setSavingLocale(true);
    setNotice(null);
    try {
      const r = await api.put('/admin/settings/default-locale', { locale: code });
      setDefaultLocale(r.data.locale);
      setNotice({ type: 'ok', text: t('admin.settings.region.defaultLocaleSaved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.settings.saveFailed') });
    } finally {
      setSavingLocale(false);
    }
  }

  async function saveCurrency(code) {
    setSavingCurrency(true);
    setNotice(null);
    try {
      const r = await api.put('/admin/currency', { code });
      setCurrency(prev => ({ ...prev, active: r.data.active }));
      setNotice({ type: 'ok', text: t('admin.settings.region.currencySaved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.settings.saveFailed') });
    } finally {
      setSavingCurrency(false);
    }
  }

  async function saveTimezone() {
    setSavingTimezone(true);
    setNotice(null);
    try {
      const r = await api.put('/admin/settings/timezone', { timezone: tzInput.trim() });
      setTimezone(r.data.timezone);
      setNotice({ type: 'ok', text: t('admin.settings.region.timezoneSaved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.settings.saveFailed') });
    } finally {
      setSavingTimezone(false);
    }
  }

  if (loading) {
    return <div className="h-40 bg-bg-card rounded-xl animate-pulse mb-4" />;
  }

  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">public</span></span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.settings.region.title')}</h3>
          <p className="truncate text-[11.5px] text-text-3">{t('admin.settings.region.hint')}</p>
        </div>
      </div>

      {notice && (
        <div className={`mb-4 rounded-xl border px-3 py-2 text-xs ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      <div className="mb-5">
        <div className="text-xs font-medium text-text-2 mb-1">{t('admin.settings.region.currencyLabel')}</div>
        <div className="text-[11px] text-text-3/70 leading-snug mb-2">{t('admin.settings.region.currencyHelp')}</div>
        <div className="flex flex-wrap gap-2">
          {currency?.supported.map(c => (
            <button
              key={c.code}
              onClick={() => saveCurrency(c.code)}
              disabled={savingCurrency || c.code === currency.active.code}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-100 ${
                c.code === currency.active.code
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-white/10 text-text-3 hover:border-white/25 hover:text-text-1'
              }`}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-text-2 mb-1">{t('admin.settings.region.timezoneLabel')}</div>
        <div className="text-[11px] text-text-3/70 leading-snug mb-2">{t('admin.settings.region.timezoneHelp')}</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tzInput}
            onChange={e => setTzInput(e.target.value)}
            placeholder="Europe/Istanbul"
            className="flex-1 bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
          />
          <button
            onClick={saveTimezone}
            disabled={savingTimezone || tzInput.trim() === timezone}
            className={`${ADMIN_BTN} shrink-0 disabled:opacity-40`}
          >
            <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">save</span>
            {savingTimezone ? t('admin.settings.savingEllipsis') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-white/8">
        <div className="text-xs font-medium text-text-2 mb-1">{t('admin.settings.region.defaultLocaleLabel')}</div>
        <div className="text-[11px] text-text-3/70 leading-snug mb-2">{t('admin.settings.region.defaultLocaleHelp')}</div>
        <div className="flex flex-wrap gap-2">
          {supportedLocales.map(code => (
            <button
              key={code}
              onClick={() => saveDefaultLocale(code)}
              disabled={savingLocale || code === defaultLocale}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-100 ${
                code === defaultLocale
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-white/10 text-text-3 hover:border-white/25 hover:text-text-1'
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * E-posta (SMTP) kartı. Mail servisi modül DEĞİL: kapanırsa kayıt doğrulama ve
 * şifre sıfırlama çalışmaz. Değerler DB'de (şifre şifreli), boş alanlar sunucu
 * ortam değişkenlerinden okunur. Şifre alanı boş bırakılırsa değişmez.
 */
const EMAIL_FIELDS = [
  { key: 'host', labelKey: 'admin.emailSettings.host', placeholder: 'smtp.mailgun.org' },
  { key: 'port', labelKey: 'admin.emailSettings.port', placeholder: '587', inputMode: 'numeric' },
  { key: 'user', labelKey: 'admin.emailSettings.user' },
  { key: 'pass', labelKey: 'admin.emailSettings.pass', secret: true },
  { key: 'from', labelKey: 'admin.emailSettings.from', placeholder: 'noreply@example.com' },
];

function EmailSettingsCard({ t }) {
  const addToast = useToastStore(s => s.add);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get('/admin/settings/email')
      .then(r => setSettings(r.data.settings))
      .catch(() => addToast(t('admin.emailSettings.loadFailed'), 'error'));
  }, [t, addToast]);

  async function save() {
    setSaving(true);
    try {
      const r = await api.put('/admin/settings/email', form);
      setSettings(r.data.settings);
      setForm({});
      addToast(t('admin.emailSettings.saved'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.emailSettings.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await api.post('/admin/settings/email/test');
      addToast(t('admin.emailSettings.testSent', { email: r.data.to }), 'success');
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.emailSettings.testFailed'), 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!settings) return <div className="h-40 bg-bg-card rounded-xl animate-pulse mb-4" />;

  const byKey = Object.fromEntries(settings.map(s => [s.key, s]));
  const secureCurrent = form.secure ?? (byKey.secure?.value === 'true');
  const dirty = Object.keys(form).length > 0;
  const inputCls = 'w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25';

  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">mail</span></span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.emailSettings.title')}</h3>
          <p className="truncate text-[11.5px] text-text-3">{t('admin.emailSettings.hint')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {EMAIL_FIELDS.map(({ key, labelKey, secret, placeholder, inputMode }) => {
          const current = byKey[key] || {};
          return (
            <div key={key}>
              <label className="text-xs font-medium text-text-2 mb-1 block" htmlFor={`smtp-${key}`}>{t(labelKey)}</label>
              <input
                id={`smtp-${key}`}
                type={secret ? 'password' : 'text'}
                inputMode={inputMode}
                autoComplete="off"
                value={form[key] ?? (secret ? '' : (current.value || ''))}
                placeholder={secret ? (current.value || '') : placeholder}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className={inputCls}
              />
              {secret && <div className="mt-1 text-[11px] text-text-3/70">{t('admin.emailSettings.passHint')}</div>}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 rounded-lg bg-bg-hover p-3 sm:col-span-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-text-2">{t('admin.emailSettings.secure')}</div>
            <div className="text-[11px] text-text-3/70">{t('admin.emailSettings.secureHelp')}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={secureCurrent}
            aria-label={t('admin.emailSettings.secure')}
            onClick={() => setForm(f => ({ ...f, secure: !secureCurrent }))}
            className={`relative w-12 h-6 rounded-full transition shrink-0 ${secureCurrent ? 'bg-success/80' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${secureCurrent ? 'translate-x-6' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || !dirty} className={`${ADMIN_BTN} disabled:opacity-40`}>
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">save</span>
          {saving ? t('admin.settings.savingEllipsis') : t('common.save')}
        </button>
        <button onClick={sendTest} disabled={testing || dirty} className={`${ADMIN_BTN} disabled:opacity-40`}>
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">send</span>
          {testing ? t('admin.emailSettings.sending') : t('admin.emailSettings.sendTest')}
        </button>
      </div>
      <p className="mt-3 text-[11px] text-text-3/70">{t('admin.emailSettings.envNote')}</p>
    </div>
  );
}

/**
 * Panel Dili kartı — yönetim panelinin arayüz dili. Yeni bir backend
 * alanı/model AÇILMADI: mevcut global I18nProvider state'ini (locale,
 * localStorage'da saklanır) doğrudan kullanır — Navbar'daki dil
 * seçiciyle (LanguageSwitcher.jsx) AYNI state, sadece admin'in beklediği
 * yerde (Sistem Ayarları) ayrı bir kontrol sunar. settingsStore.js'teki
 * preferences.language (spor/oran içerik dili) ile KARIŞTIRILMAMALI —
 * o ayrı, ilgisiz bir kavram.
 */
function PanelLanguageCard() {
  const { t, locale, setLocale, locales } = useTranslation();
  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">translate</span></span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.settings.panelLanguage.title')}</h3>
          <p className="truncate text-[11.5px] text-text-3">{t('admin.settings.panelLanguage.hint')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {locales.map(code => (
          <button
            key={code}
            onClick={() => setLocale(code)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              code === locale
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-white/10 text-text-3 hover:border-white/25 hover:text-text-1'
            }`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState(null);

  const GROUPS = [
    {
      icon: 'send',
      title: t('admin.settings.telegram'),
      hint: t('admin.settings.telegramHint'),
      keys: [
        { key: 'TELEGRAM_BOT_TOKEN', label: t('admin.settings.botToken'), placeholder: '123456:ABC-DEF…' },
        { key: 'TELEGRAM_CHAT_ID',   label: t('admin.settings.chatId'),   placeholder: '-1001234567890' },
      ],
    },
    {
      icon: 'link',
      title: t('admin.settings.webhook'),
      hint: t('admin.settings.webhookHint'),
      keys: [
        { key: 'ALERT_WEBHOOK_URL', label: t('admin.settings.webhookUrl'), placeholder: 'https://hooks.slack.com/…' },
      ],
    },
    {
      icon: 'mail',
      title: t('admin.settings.email'),
      hint: t('admin.settings.emailHint'),
      keys: [
        { key: 'ALERT_EMAIL_TO', label: t('admin.settings.recipientAddress'), placeholder: 'admin@example.com' },
      ],
    },
  ];

  const SOURCE_BADGE = {
    db:    { label: t('admin.settings.sourcePanel'), cls: 'bg-success/15 text-success border-success/30' },
    env:   { label: '.env',  cls: 'bg-info/15 text-info border-info/30' },
    unset: { label: t('admin.settings.sourceUndefined'), cls: 'bg-white/5 text-text-3 border-white/10' },
  };

  function load() {
    setLoading(true);
    api.get('/admin/settings/alerts')
      .then(r => setSettings(r.data.settings))
      .catch(() => setNotice({ type: 'error', text: t('admin.settings.loadFailed') }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const byKey = Object.fromEntries(settings.map(s => [s.key, s]));
  const anyConfigured = settings.some(s => s.source !== 'unset');

  async function save(payload, successText) {
    setSaving(true);
    setNotice(null);
    try {
      const r = await api.put('/admin/settings/alerts', { settings: payload });
      setSettings(r.data.settings);
      setDraft({});
      setNotice({ type: 'ok', text: successText });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.settings.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setNotice(null);
    try {
      const r = await api.post('/admin/settings/alerts/test');
      const sent = Object.entries(r.data.sent).filter(([, v]) => v).map(([k]) => k);
      setNotice({ type: 'ok', text: t('admin.settings.testAlertSent', { channels: sent.join(', ') }) });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.settings.testSendFailed') });
    } finally {
      setTesting(false);
    }
  }

  const dirty = Object.values(draft).some(v => v?.trim());

  return (
    <div>
      <PanelLanguageCard />
      <RegionCurrencyCard t={t} />
      <EmailSettingsCard t={t} />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">notifications</span></span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.settings.alertChannels')}</h3>
        </div>
        <button
          onClick={runTest}
          disabled={testing || !anyConfigured}
          className={`${ADMIN_BTN} disabled:opacity-40`}
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">send</span>
          {testing ? t('admin.settings.sending') : t('admin.settings.sendTest')}
        </button>
      </div>
      <p className="text-sm text-text-3 mb-6">
        {t('admin.settings.alertChannelsHint')}
      </p>

      {!loading && !anyConfigured && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/15 px-4 py-3 text-sm text-warning">
          {t('admin.settings.noChannelConfigured')}
        </div>
      )}

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tek dış konteyner: 3 kanal alt-bölüm olarak, ayrı kart YOK (Faz 4.2) */}
          <div className="bg-bg-card border border-white/10 rounded-xl p-4">
            {GROUPS.map((group, idx) => (
              <div
                key={group.title}
                className={idx > 0 ? 'border-t border-white/[0.06] pt-4 mt-4' : ''}
              >
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-text-1">
                  <span className="material-symbols-outlined !text-[18px] text-primary" aria-hidden="true">{group.icon}</span>
                  {group.title}
                </h4>
                <p className="text-xs text-text-3 mt-0.5 mb-4">{group.hint}</p>

                <div className="space-y-3">
                  {group.keys.map(({ key, label, placeholder }) => {
                    const current = byKey[key] || { source: 'unset' };
                    const badge = SOURCE_BADGE[current.source];
                    return (
                      <div key={key}>
                        <div className="flex items-center gap-2 mb-1">
                          <label className="text-xs font-medium text-text-2">{label}</label>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {current.value && (
                            <span className="text-[10px] text-text-3 font-mono">{current.value}</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={draft[key] ?? ''}
                            onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                            placeholder={current.source === 'unset' ? placeholder : t('admin.settings.enterNewValue')}
                            className="flex-1 bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
                          />
                          {current.source === 'db' && (
                            <button
                              onClick={() => save({ [key]: '' }, t('admin.settings.cleared', { label }))}
                              disabled={saving}
                              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-text-3 transition hover:border-danger/40 hover:text-danger disabled:opacity-40"
                            >
                              {t('admin.igames.clear')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => save(
                Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.trim())),
                t('admin.settings.settingsSaved'),
              )}
              disabled={saving || !dirty}
              className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
            >
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
              {saving ? t('admin.settings.savingEllipsis') : t('common.save')}
            </button>
            {dirty && (
              <button onClick={() => setDraft({})} className={ADMIN_BTN_GHOST}>
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">undo</span>
                {t('admin.settings.discard')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
