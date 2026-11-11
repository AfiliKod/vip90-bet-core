// client/src/components/admin/EmailProviderPanel.jsx
//
// E-posta sağlayıcı paneli — Modules → "Email Gateway" kartının gövdesi
// (2026-10-06'da İletişim → E-posta → Provider sekmesinden taşındı; sekme bu
// tarihte kaldırıldı). Email Gateway anahtarı KART BAŞLIĞINDADIR
// (ModuleCard'ın sağ üstüne `headerSwitch` olarak çizilir, Core rozetinin
// yerine geçer): AÇIK → transport panel/DB ayarlarını (gateway) kullanır,
// KAPALI → sunucu .env değerleri (`SMTP_GATEWAY_ENABLED` / `smtp.gatewayEnabled`).
// Panelde kalan: anahtarın yardım metni, aktif mod rozeti ve form alanları —
// anahtar durumu `gatewayEnabled` prop'uyla gelir (Modules anında kaydeder).
//
// 2026-10-30 (Mailtrap): sağlayıcı artık GÖNDERME MEKANİZMASINI da seçer —
// `mailtrap` → Mailtrap Email API (token + opsiyonel sandbox), diğerleri →
// genel SMTP transport. Form buna göre iki blok çizer: API bloğu
// (token/sandbox) veya SMTP bağlantı bloğu (host/port/user/pass/secure).
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

// Yer tutucular genel örnekdir (AGENTS.md — forma gerçek sağlayıcı değeri
// yazılmaz). `secure` ve `useSandbox` formda booldur; sunucuya 'true'/'false'
// stringi olarak gider (`integrationSettings.update`).
const SMTP_FIELDS = [
  { key: 'host', labelKey: 'admin.emailSettings.host', placeholder: 'smtp.example.com' },
  { key: 'port', labelKey: 'admin.emailSettings.port', placeholder: '587', inputMode: 'numeric' },
  { key: 'user', labelKey: 'admin.emailSettings.user', placeholder: 'postmaster@example.com' },
  { key: 'pass', labelKey: 'admin.emailSettings.pass', secret: true, hintKey: 'admin.emailSettings.passHint' },
];

const API_FIELDS = [
  { key: 'token', labelKey: 'admin.emailSettings.token', secret: true, hintKey: 'admin.emailSettings.tokenHint' },
  { key: 'sandboxInboxId', labelKey: 'admin.emailSettings.sandboxInboxId', placeholder: '123456', inputMode: 'numeric' },
];

const COMMON_FIELDS = [
  { key: 'from', labelKey: 'admin.emailSettings.from', placeholder: 'noreply@example.com' },
  { key: 'fromName', labelKey: 'admin.emailSettings.fromName', placeholder: 'VIP90' },
];

function SwitchRow({ checked, onToggle, label, help }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-bg-hover p-3 sm:col-span-2">
      <div className="min-w-0">
        <div className="text-xs font-medium text-text-2">{label}</div>
        <div className="text-[11px] text-text-3/70">{help}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative w-12 h-6 rounded-full transition shrink-0 ${checked ? 'bg-success/80' : 'bg-white/10'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : ''}`} />
      </button>
    </div>
  );
}

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
  const sandboxCurrent = form.useSandbox ?? (byKey.useSandbox?.value === 'true');
  // Email Gateway anahtarı kart başlığında (Modules → headerSwitch) durur ve
  // anında kaydedilir; prop yoksa (yüklenmedi/tek başına kullanıldı) DB'deki
  // son değer okunur. Sunucu 'true' (default) döndürür; eski sunucuda alan
  // hiç yoksa da gateway AÇIK sayılır (eski davranış korunur).
  const gatewayCurrent = gatewayEnabled ?? (byKey.gatewayEnabled?.value !== 'false');
  const dirty = Object.keys(form).length > 0;
  const tokenConfigured = !!(form.token || byKey.token?.configured);
  const provider = inferEmailProvider(
    form.host ?? byKey.host?.value,
    form.provider ?? byKey.provider?.value,
    { tokenConfigured },
  );
  const isApi = provider === 'mailtrap';
  // Yapılandırılma ölçütü mekanizmaya göre değişir: API → token, SMTP → host.
  const configured = (isApi ? byKey.token?.configured : byKey.host?.configured) && byKey.from?.configured;
  const connectionFields = isApi ? API_FIELDS : SMTP_FIELDS;
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
        <span className="px-2 py-0.5 rounded-full border text-xs bg-white/5 border-white/10 text-text-3">
          {isApi ? t('admin.emailSettings.mechanismApi') : t('admin.emailSettings.mechanismSmtp')}
        </span>
        {!isApi && byKey.host?.value && (
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

        {[...connectionFields, ...COMMON_FIELDS].map(({ key, labelKey, secret, hintKey, placeholder, inputMode }) => {
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
              {secret && hintKey && <div className="mt-1 text-[11px] text-text-3/70">{t(hintKey)}</div>}
            </div>
          );
        })}
        {isApi ? (
          <SwitchRow
            checked={sandboxCurrent}
            onToggle={() => setForm(f => ({ ...f, useSandbox: !sandboxCurrent }))}
            label={t('admin.emailSettings.useSandbox')}
            help={t('admin.emailSettings.useSandboxHelp')}
          />
        ) : (
          <SwitchRow
            checked={secureCurrent}
            onToggle={() => setForm(f => ({ ...f, secure: !secureCurrent }))}
            label={t('admin.emailSettings.secure')}
            help={t('admin.emailSettings.secureHelp')}
          />
        )}
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
