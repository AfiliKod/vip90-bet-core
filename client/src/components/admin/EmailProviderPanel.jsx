// client/src/components/admin/EmailProviderPanel.jsx
//
// E-posta (SMTP/Mailgun) sağlayıcı paneli — Modules → "Email Gateway" kartının
// gövdesi (2026-10-06'da İletişim → E-posta → Provider sekmesinden taşındı;
// sekme bu tarihte kaldırıldı). Email Gateway anahtarı KART BAŞLIĞINDADIR
// (ModuleCard'ın sağ üstüne `headerSwitch` olarak çizilir, Core rozetinin
// yerine geçer): AÇIK → transport panel/DB ayarlarını (gateway) kullanır,
// KAPALI → sunucu .env SMTP'si (`SMTP_GATEWAY_ENABLED` / `smtp.gatewayEnabled`).
// Panelde kalan: anahtarın yardım metni, aktif mod rozeti ve form alanları —
// anahtar durumu `gatewayEnabled` prop'uyla gelir (Modules anında kaydeder).
//
// Taşınma (2026-10-03): gövde eskiden `Settings.jsx` içindeki
// `EmailSettingsCard`'tı (Genel sekmesi). Sağlayıcı ayarının operatörün
// kod/.env sayfalarında gezinmeden tek yerden yapılması hedefiyle Modules
// kartına taşındı; kartın dış çerçevesi ModuleCard tarafından verilir, burada
// yalnızca içerik (`<>…</>`) render edilir — `SmsGatewayCard.jsx` ile aynı
// desen.
//
// Değerler DB'de (`smtp.*`, gizli alanlar AES-256-GCM) tutulur; boş alan
// sunucu tarafındaki mevcut değeri (DB > env) değiştirmez. Panel geriye düz
// secret dönmez, yalnız maskeli önizleme + "db/env/unset" kaynağı döner.
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import { EMAIL_PROVIDERS, inferEmailProvider, applyProviderPreset } from './emailProviderLogic.js';

const SOURCE_BADGE = {
  db: 'admin.emailSettings.sourcePanel',
  env: 'admin.emailSettings.sourceEnv',
  unset: 'admin.emailSettings.sourceUnset',
};

const SOURCE_CLS = {
  db: 'bg-success/15 text-success border-success/30',
  env: 'bg-info/15 text-info border-info/30',
  unset: 'bg-white/5 text-text-3 border-white/10',
};

// `secure` formda booldur (eski Settings kartıyla aynı), sunucuya
// 'true'/'false' stringi olarak gider (`integrationSettings.update`).
const EMAIL_FIELDS = [
  { key: 'host', labelKey: 'admin.emailSettings.host', placeholder: 'smtp.mailgun.org' },
  { key: 'port', labelKey: 'admin.emailSettings.port', placeholder: '587', inputMode: 'numeric' },
  { key: 'user', labelKey: 'admin.emailSettings.user', placeholder: 'postmaster@example.com' },
  { key: 'pass', labelKey: 'admin.emailSettings.pass', secret: true },
  { key: 'from', labelKey: 'admin.emailSettings.from', placeholder: 'noreply@example.com' },
  { key: 'fromName', labelKey: 'admin.emailSettings.fromName', placeholder: 'VIP90' },
];

export default function EmailProviderPanel({ gatewayEnabled }) {
  const { t } = useTranslation();
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

  if (!settings) return <div className="h-40 bg-bg-card rounded-xl animate-pulse" />;

  const byKey = Object.fromEntries(settings.map(s => [s.key, s]));
  const secureCurrent = form.secure ?? (byKey.secure?.value === 'true');
  // Email Gateway anahtarı kart başlığında (Modules → headerSwitch) durur ve
  // anında kaydedilir; prop yoksa (yüklenmedi/tek başına kullanıldı) DB'deki
  // son değer okunur. Sunucu 'true' (default) döndürür; eski sunucuda alan
  // hiç yoksa da gateway AÇIK sayılır (eski davranış korunur).
  const gatewayCurrent = gatewayEnabled ?? (byKey.gatewayEnabled?.value !== 'false');
  const dirty = Object.keys(form).length > 0;
  const provider = inferEmailProvider(form.host ?? byKey.host?.value, form.provider ?? byKey.provider?.value);
  const configured = byKey.host?.configured && byKey.from?.configured;
  const inputCls = 'w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full border text-xs ${configured ? 'bg-success/15 text-success border-success/30' : 'bg-danger/20 text-danger border-danger/30'}`}>
          {configured ? t('admin.emailSettings.configured') : t('admin.emailSettings.notConfigured')}
        </span>
        <span className={`px-2 py-0.5 rounded-full border text-xs ${gatewayCurrent ? 'bg-info/15 text-info border-info/30' : 'bg-white/5 border-white/10 text-text-3'}`}>
          {gatewayCurrent ? t('admin.emailGateway.modeGateway') : t('admin.emailGateway.modeSmtp')}
        </span>
        <span className="px-2 py-0.5 rounded-full border text-xs bg-white/5 border-white/10 text-text-3">
          {t('admin.emailSettings.providerLabel')}: {t(`admin.emailSettings.provider.${provider}`)}
        </span>
        {byKey.host?.value && (
          <span className="px-2 py-0.5 rounded-full border text-xs bg-white/5 border-white/10 text-text-3 font-mono">
            {byKey.host.value}:{byKey.port?.value || '587'}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Anahtarın kendisi kart başlığında (headerSwitch) — burada yalnızca
            iki modun ne yaptığı yazılı durur. */}
        <div className="rounded-lg bg-bg-hover p-3 sm:col-span-2">
          <div className="text-xs font-medium text-text-2">{t('admin.emailGateway.enabled')}</div>
          <div className="text-[11px] text-text-3/70">{t('admin.emailGateway.enabledHelp')}</div>
        </div>

        <div>
          <label className="text-xs font-medium text-text-2 mb-1 block" htmlFor="smtp-provider">{t('admin.emailSettings.provider')}</label>
          <select
            id="smtp-provider"
            value={provider}
            onChange={e => setForm(f => applyProviderPreset(e.target.value, f))}
            className={inputCls}
          >
            {EMAIL_PROVIDERS.map(p => (
              <option key={p} value={p}>{t(`admin.emailSettings.provider.${p}`)}</option>
            ))}
          </select>
          <div className="mt-1 text-[11px] text-text-3/70">{t('admin.emailSettings.providerHelp')}</div>
        </div>

        {EMAIL_FIELDS.map(({ key, labelKey, secret, placeholder, inputMode }) => {
          const current = byKey[key] || {};
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-medium text-text-2" htmlFor={`smtp-${key}`}>{t(labelKey)}</label>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${SOURCE_CLS[current.source] ?? SOURCE_CLS.unset}`}>
                  {t(SOURCE_BADGE[current.source] ?? SOURCE_BADGE.unset)}
                </span>
              </div>
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
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="text-xs px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition disabled:opacity-40"
        >
          <span className="material-symbols-outlined !text-[15px] align-[-3px]" aria-hidden="true">save</span>{' '}
          {saving ? t('admin.settings.savingEllipsis') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || dirty}
          className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-text-2 hover:bg-white/10 transition disabled:opacity-40"
        >
          <span className="material-symbols-outlined !text-[15px] align-[-3px]" aria-hidden="true">send</span>{' '}
          {testing ? t('admin.emailSettings.sending') : t('admin.emailSettings.sendTest')}
        </button>
      </div>
      <p className="mt-3 text-[11px] text-text-3/70">{t('admin.emailSettings.envNote')}</p>
    </>
  );
}
