import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

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
 */
function RegionCurrencyCard({ t }) {
  const [currency, setCurrency] = useState(null);
  const [timezone, setTimezone] = useState('');
  const [tzInput, setTzInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/currency'),
      api.get('/admin/settings/timezone'),
    ])
      .then(([currencyRes, tzRes]) => {
        setCurrency(currencyRes.data);
        setTimezone(tzRes.data.timezone);
        setTzInput(tzRes.data.timezone);
      })
      .catch(() => setNotice({ type: 'error', text: t('admin.settings.loadFailed') }))
      .finally(() => setLoading(false));
  }, [t]);

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
      <h2 className="text-lg font-semibold text-text-1">🌍 {t('admin.settings.region.title')}</h2>
      <p className="text-xs text-text-3 mt-0.5 mb-4">{t('admin.settings.region.hint')}</p>

      {notice && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-xs border ${
          notice.type === 'ok'
            ? 'border-green-500/30 bg-green-500/10 text-green-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
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
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'border-white/10 text-text-3 hover:text-text-1 hover:border-white/25'
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
            className="px-4 py-2 rounded-lg text-xs font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
          >
            {savingTimezone ? t('admin.settings.savingEllipsis') : t('common.save')}
          </button>
        </div>
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
      title: `📨 ${t('admin.settings.telegram')}`,
      hint: t('admin.settings.telegramHint'),
      keys: [
        { key: 'TELEGRAM_BOT_TOKEN', label: t('admin.settings.botToken'), placeholder: '123456:ABC-DEF…' },
        { key: 'TELEGRAM_CHAT_ID',   label: t('admin.settings.chatId'),   placeholder: '-1001234567890' },
      ],
    },
    {
      title: `🔗 ${t('admin.settings.webhook')}`,
      hint: t('admin.settings.webhookHint'),
      keys: [
        { key: 'ALERT_WEBHOOK_URL', label: t('admin.settings.webhookUrl'), placeholder: 'https://hooks.slack.com/…' },
      ],
    },
    {
      title: `✉️ ${t('admin.settings.email')}`,
      hint: t('admin.settings.emailHint'),
      keys: [
        { key: 'ALERT_EMAIL_TO', label: t('admin.settings.recipientAddress'), placeholder: 'admin@example.com' },
      ],
    },
  ];

  const SOURCE_BADGE = {
    db:    { label: t('admin.settings.sourcePanel'), cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
    env:   { label: '.env',  cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
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
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">⚙️ {t('admin.settings.pageTitle')}</h1>

      <RegionCurrencyCard t={t} />

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-text-1">🔔 {t('admin.settings.alertChannels')}</h2>
        <button
          onClick={runTest}
          disabled={testing || !anyConfigured}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-text-2 hover:text-text-1 disabled:opacity-40 transition"
        >
          {testing ? t('admin.settings.sending') : t('admin.settings.sendTest')}
        </button>
      </div>
      <p className="text-sm text-text-3 mb-6">
        {t('admin.settings.alertChannelsHint')}
      </p>

      {!loading && !anyConfigured && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {t('admin.settings.noChannelConfigured')}
        </div>
      )}

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          notice.type === 'ok'
            ? 'border-green-500/30 bg-green-500/10 text-green-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
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
          {GROUPS.map(group => (
            <div key={group.title} className="bg-bg-card border border-white/10 rounded-xl p-4">
              <h2 className="font-semibold text-text-1">{group.title}</h2>
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
                            className="px-3 rounded-lg text-xs border border-white/10 text-text-3 hover:text-red-300 hover:border-red-500/30 disabled:opacity-40 transition"
                          >
                            {t('admin.palace.clear')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              onClick={() => save(
                Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.trim())),
                t('admin.settings.settingsSaved'),
              )}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
            >
              {saving ? t('admin.settings.savingEllipsis') : t('common.save')}
            </button>
            {dirty && (
              <button onClick={() => setDraft({})} className="text-xs text-text-3 hover:text-text-2">
                {t('admin.settings.discard')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
