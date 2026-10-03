import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import { toKeySegment } from '../../utils/smsSenderLogic.js';

/**
 * SMS Gateway sağlayıcı kartı gövdesi — `Modules.jsx` içindeki
 * `MODULE_VIEW['sms-gateway']` girdisine bağlanır.
 *
 * Neden ayrı dosya: `Modules.jsx` zaten altı sağlayıcı gövdesi taşıyor;
 * yeni bir gövde eklemek yerine modül başına bir dosya (`components/admin/`
 * deseni) tutmak sayfayı okunur bırakıyor. Şablonlara giden "Yönet" linki
 * kart başlığındaki standart `manageTo` alanıyla verilir, burada tekrar
 * yapılmaz.
 *
 * Kimlik bilgileri sunucuda AES-256-GCM ile şifrelenerek saklanır; bu yüzden
 * panel geriye DOĞRU değer göstermez, yalnızca "var/yok" + "db/env" rozeti ve
 * maskeli önizleme gösterir. Boş bırakılan alan mevcut değeri değiştirmez.
 */
const SOURCE_BADGE = {
  db: 'admin.smsGateway.sourcePanel',
  env: 'admin.smsGateway.sourceEnv',
  unset: 'admin.smsGateway.sourceUnset',
};

const SOURCE_CLS = {
  db: 'bg-success/15 text-success border-success/30',
  env: 'bg-info/15 text-info border-info/30',
  unset: 'bg-white/5 text-text-3 border-white/10',
};

function Field({ label, badgeValue, placeholder, value, onChange, type = 'text', mono = true, activeValue = null }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-[10px] uppercase tracking-wide text-text-3">{label}</label>
        {badgeValue && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${SOURCE_CLS[badgeValue] ?? SOURCE_CLS.unset}`}>
            {t(SOURCE_BADGE[badgeValue] ?? SOURCE_BADGE.unset)}
          </span>
        )}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/50 ${mono ? 'font-mono' : ''}`}
      />
      {/* Kaynak .env ise alan bilerek boş bırakılır (kaydedilirse .env
          ezilmesin diye) — ama SAHTE bir örnek placeholder göstererek
          operatörü yanıltmaktansa gerçek değeri burada yaz. */}
      {badgeValue === 'env' && activeValue && (
        <div className="mt-1 text-[11px] text-text-3">
          {t('admin.smsGateway.currentEnvValue', { value: activeValue })}
        </div>
      )}
    </div>
  );
}

export default function SmsGatewayBody() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ accountSid: '', authToken: '', fromNumber: '', messagingServiceSid: '', defaultCountryCode: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [gate, setGate] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/sms/settings');
      setStatus(data);
      // Gönderim kapısı ayrı uçtan: kimlik bilgisi yoksa da engel görünsün.
      api.get('/admin/sms/senders/gate')
        .then(({ data: g }) => setGate(g))
        .catch(() => {});
      // Kaynak .env ise alan boş bırakılır — .env değerini üstüne yazmak
      // operatörün sunucu tarafı yapılandırmasını sessizce ezmek olurdu.
      setForm(f => ({
        ...f,
        accountSid: data.accountSidSource === 'db' ? data.accountSid ?? '' : '',
        fromNumber: data.fromNumberSource === 'db' ? data.fromNumber ?? '' : '',
        messagingServiceSid: data.messagingServiceSidSource === 'db' ? data.messagingServiceSid ?? '' : '',
        defaultCountryCode: data.defaultCountryCodeSource === 'db' ? data.defaultCountryCode ?? '' : '',
      }));
    } catch {
      addToast(t('admin.smsGateway.loadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const patch = {};
      if (form.accountSid) patch.accountSid = form.accountSid;
      if (form.authToken) patch.authToken = form.authToken;
      if (form.fromNumber) patch.fromNumber = form.fromNumber;
      if (form.messagingServiceSid) patch.messagingServiceSid = form.messagingServiceSid;
      if (form.defaultCountryCode) patch.defaultCountryCode = form.defaultCountryCode;
      if (!Object.keys(patch).length) {
        addToast(t('admin.smsGateway.nothingToSave'), 'error');
        return;
      }
      const { data } = await api.patch('/admin/sms/settings', patch);
      setStatus(data);
      setForm(f => ({ ...f, accountSid: '', authToken: '', fromNumber: '', messagingServiceSid: '', defaultCountryCode: '' }));
      addToast(t('admin.smsGateway.saved'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.smsGateway.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const { data } = await api.post('/admin/sms/settings/test');
      addToast(data.ok ? t('admin.smsGateway.testOk', { name: data.friendlyName || '' }) : (data.error || t('admin.smsGateway.testFailed')), data.ok ? 'success' : 'error');
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.smsGateway.testFailed'), 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!status) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;

  return (
    <>
      <p className="text-text-3 text-sm mb-4">{t('admin.smsGateway.desc')}</p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className={`px-2 py-0.5 rounded-full border text-xs ${status.configured ? 'bg-success/15 text-success border-success/30' : 'bg-danger/20 text-danger border-danger/30'}`}>
          {status.configured ? t('admin.smsGateway.configured') : t('admin.smsGateway.notConfigured')}
        </span>
        <span className="px-2 py-0.5 rounded-full border text-xs bg-white/5 border-white/10 text-text-3">
          {t('admin.smsGateway.providerLabel')}: {status.provider}
        </span>
        {status.accountSidMasked && (
          <span className="px-2 py-0.5 rounded-full border text-xs bg-white/5 border-white/10 text-text-3 font-mono">
            {status.accountSidMasked}
          </span>
        )}
      </div>

      {!status.encryptionKeyAvailable && (
        <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
          {t('admin.smsGateway.encryptionKeyMissing')}
        </div>
      )}

      <div className="space-y-3">
        <Field
          label={t('admin.smsGateway.accountSid')}
          badgeValue={status.accountSidSource}
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          activeValue={status.accountSid}
          value={form.accountSid}
          onChange={v => setForm(f => ({ ...f, accountSid: v }))}
        />
        <Field
          label={t('admin.smsGateway.authToken')}
          badgeValue={status.authTokenSource}
          type="password"
          placeholder={status.authTokenConfigured ? status.authTokenMasked : t('admin.smsGateway.enterNewValue')}
          value={form.authToken}
          onChange={v => setForm(f => ({ ...f, authToken: v }))}
        />
        <Field
          label={t('admin.smsGateway.fromNumber')}
          badgeValue={status.fromNumberSource}
          placeholder="+905321112233"
          activeValue={status.fromNumber}
          value={form.fromNumber}
          onChange={v => setForm(f => ({ ...f, fromNumber: v }))}
        />
        <Field
          label={t('admin.smsGateway.messagingServiceSid')}
          badgeValue={status.messagingServiceSidSource}
          placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          activeValue={status.messagingServiceSid}
          value={form.messagingServiceSid}
          onChange={v => setForm(f => ({ ...f, messagingServiceSid: v }))}
        />
        <Field
          label={t('admin.smsGateway.defaultCountryCode')}
          badgeValue={status.defaultCountryCodeSource}
          placeholder="90"
          activeValue={status.defaultCountryCode}
          value={form.defaultCountryCode}
          onChange={v => setForm(f => ({ ...f, defaultCountryCode: v.replace(/\D/g, '') }))}
        />
      </div>

      <p className="text-xs text-text-3 mt-2">{t('admin.smsGateway.emptyFieldHelp')}</p>

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-xs px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition disabled:opacity-40"
        >
          {saving ? t('admin.smsGateway.saving') : t('admin.smsGateway.save')}
        </button>
        <button
          type="button"
          onClick={test}
          disabled={testing || !status.configured}
          className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-text-2 hover:bg-white/10 transition disabled:opacity-40"
        >
          {testing ? t('admin.smsGateway.testing') : t('admin.smsGateway.test')}
        </button>
      </div>

      {/* Gönderim hazır mı? En sık sorulan soru: "neden gönderemiyorum?".
          Hesap tipi gerçek Twilio API'sinden gelir (kuru test yapar), gönderici
          onayı Göndericiler sekmesinden yönetilir. */}
      <div className="mt-5 pt-4 border-t border-white/8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wide text-text-3">{t('admin.smsSenders.gateTitle')}</span>
          {gate && (
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${
              gate.blocked ? 'bg-danger/20 text-danger border-danger/30' : 'bg-success/15 text-success border-success/30'
            }`}>
              {gate.blocked ? t('admin.smsSenders.gateBlocked') : t('admin.smsSenders.gateReady')}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${
            status?.accountType === 'trial' ? 'bg-warning/15 text-warning border-warning/30' : 'bg-white/5 border-white/10 text-text-3'
          }`}>
            {t(`admin.smsSenders.accountType.${status?.accountType ?? 'unknown'}`)}
          </span>
        </div>
        {gate?.blocked ? (
          <p className="text-xs text-danger">{t(`admin.smsSenders.reason.${toKeySegment(gate.blocked)}`)}</p>
        ) : (
          <p className="text-xs text-text-3">{t('admin.smsSenders.gateReadyHelp')}</p>
        )}
        {status?.accountType === 'unknown' && (
          <p className="mt-1.5 text-xs text-warning">{t('admin.smsSenders.accountTypeUnknownHint')}</p>
        )}
        <Link
          to="/admin/sms-templates?tab=senders"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:brightness-110 transition"
        >
          {t('admin.smsSenders.manageSenders')}
          <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">arrow_forward</span>
        </Link>
      </div>

      <p className="text-xs text-text-3 mt-4">{t('admin.smsGateway.templatesHint')}</p>
    </>
  );
}