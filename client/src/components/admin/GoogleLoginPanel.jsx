import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useToastStore } from '../../store/toastStore';

/**
 * Settings → Modules → Google Login kartının gövdesi.
 *
 * Alanlar sunucuda DB (sır şifreli) > .env önceliğiyle çözülür
 * (`/admin/settings/google-auth`); gizli alan boş bırakılırsa değişmez.
 * Aç/kapa anahtarı kart başlığındadır (Modules.jsx) ve `enabled` prop'u ile
 * gelir; giriş ekranındaki buton yalnız anahtar açık VE Client ID + Secret
 * tanımlıyken görünür.
 */
const FIELDS = [
  { key: 'clientId', labelKey: 'admin.googleLogin.clientId' },
  { key: 'clientSecret', labelKey: 'admin.googleLogin.clientSecret', secret: true },
  { key: 'redirectUri', labelKey: 'admin.googleLogin.redirectUri' },
];

export default function GoogleLoginPanel({ enabled }) {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/admin/settings/google-auth');
      setData(r.data);
      setForm({});
    } catch {
      addToast(t('admin.googleLogin.loadFailed'), 'error');
    }
  }, [addToast, t]);

  useEffect(() => { load(); }, [load]);

  async function save(extra = {}) {
    setSaving(true);
    try {
      const r = await api.put('/admin/settings/google-auth', { ...form, ...extra });
      setData(r.data);
      setForm({});
      addToast(t('admin.googleLogin.saved'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.googleLogin.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="text-text-3 text-sm">{t('common.loading')}</div>;
  const byKey = Object.fromEntries(data.settings.map(s => [s.key, s]));
  const credentialsSet = Boolean(byKey.clientId?.configured && byKey.clientSecret?.configured);
  const active = (enabled ?? true) && credentialsSet;
  const dirty = Object.keys(form).length > 0;

  return (
    <>
      <p className="text-text-3 text-sm mb-3">{t('admin.googleLogin.intro')}</p>
      <div className="mb-4">
        <span className={`px-2 py-0.5 rounded-full text-xs border ${active
          ? 'bg-success/15 text-success border-success/30'
          : 'bg-white/5 text-text-3 border-white/10'}`}>
          {active ? t('admin.googleLogin.statusActive')
            : enabled === false ? t('admin.googleLogin.statusOff')
            : t('admin.googleLogin.statusMissing')}
        </span>
      </div>
      <div className="space-y-3">
        {FIELDS.map(({ key, labelKey, secret }) => {
          const current = byKey[key] || {};
          const source = current.source || 'unset';
          const badgeCls = source === 'db' ? 'bg-success/15 text-success border-success/30'
            : source === 'env' ? 'bg-info/15 text-info border-info/30'
            : 'bg-white/5 text-text-3 border-white/10';
          const badgeLabel = source === 'db' ? t('admin.moduleCards.sourcePanel')
            : source === 'env' ? t('admin.moduleCards.sourceEnv')
            : t('admin.moduleCards.sourceUnset');
          const placeholder = secret ? (current.value || '')
            : key === 'redirectUri' ? data.defaultRedirectUri : '';
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-medium text-text-2" htmlFor={`google-${key}`}>{t(labelKey)}</label>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badgeCls}`}>{badgeLabel}</span>
                {secret && source === 'db' && (
                  <button type="button" disabled={saving} onClick={() => save({ clear: [key] })}
                    className="ml-auto text-[10px] text-text-3 hover:text-text-1 underline disabled:opacity-40">
                    {t('admin.slikairSettings.revertEnv')}
                  </button>
                )}
              </div>
              <input
                id={`google-${key}`}
                type={secret ? 'password' : 'text'}
                autoComplete="off"
                value={form[key] ?? (secret ? '' : (current.value || ''))}
                placeholder={placeholder}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
              />
              {secret && <div className="mt-1 text-[11px] text-text-3/70">{t('admin.slikairSettings.secretHint')}</div>}
              {key === 'redirectUri' && (
                <div className="mt-1 text-[11px] text-text-3/70">{t('admin.googleLogin.redirectHint')}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => save()}
          disabled={saving || !dirty}
          className="text-xs px-3 py-2 rounded-lg border border-white/10 text-text-2 hover:text-text-1 disabled:opacity-40 transition"
        >
          {saving ? t('admin.settings.savingEllipsis') : t('common.save')}
        </button>
        <span className="text-[11px] text-text-3/70">{t('admin.slikairSettings.envNote')}</span>
      </div>
    </>
  );
}
