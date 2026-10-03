import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

export default function AdminKycSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [kyEnabled, setKyEnabled] = useState(true);
  const [provider, setProvider] = useState('manual');

  const SOURCE_BADGE = {
    db:      { label: t('admin.kycSettings.sourcePanel'), cls: 'bg-success/15 text-success border-success/30' },
    env:     { label: t('admin.kycSettings.sourceEnv'),   cls: 'bg-info/15 text-info border-info/30' },
    default: { label: t('admin.kycSettings.sourceDefault'), cls: 'bg-white/5 text-text-3 border-white/10' },
    unset:   { label: t('admin.kycSettings.sourceUnset'),   cls: 'bg-white/5 text-text-3 border-white/10' },
  };

  useEffect(() => {
    api.get('/admin/kyc-settings')
      .then(r => {
        setSettings(r.data.settings);
        const map = Object.fromEntries(r.data.settings.map(s => [s.key, s.rawValue || s.value || '']));
        setKyEnabled(map.KYC_ENABLED !== 'false');
        setProvider(map.KYC_PROVIDER || 'manual');
      })
      .catch(() => setNotice({ type: 'error', text: t('admin.kycSettings.loadError') }))
      .finally(() => setLoading(false));
  }, [t]);

  const byKey = Object.fromEntries(settings.map(s => [s.key, s]));

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        settings: {
          KYC_ENABLED: kyEnabled ? 'true' : 'false',
          KYC_PROVIDER: provider,
        },
      };
      for (const [key, val] of Object.entries(draft)) {
        if (val && key !== 'KYC_ENABLED' && key !== 'KYC_PROVIDER') {
          payload.settings[key] = val;
        }
      }
      const r = await api.put('/admin/kyc-settings', payload);
      setSettings(r.data.settings);
      setDraft({});
      setNotice({ type: 'ok', text: t('admin.kycSettings.saved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.kycSettings.saveError') });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setNotice(null);
    try {
      await api.post('/admin/kyc-settings/test');
      setNotice({ type: 'ok', text: t('admin.kycSettings.testOk') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.kycSettings.testError') });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="h-40 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">{t('admin.kycSettings.title')}</h1>

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
        <h2 className="font-semibold text-text-1 mb-3">{t('admin.kycSettings.generalSettings')}</h2>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-text-2">{t('admin.kycSettings.kycActive')}</div>
            <div className="text-xs text-text-3">{t('admin.kycSettings.kycActiveHint')}</div>
          </div>
          <button
            onClick={() => setKyEnabled(v => !v)}
            role="switch"
            aria-checked={kyEnabled}
            className={`relative w-12 h-6 rounded-full transition shrink-0 ${kyEnabled ? 'bg-success/80' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${kyEnabled ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        <div className="mb-4">
          <div className="text-sm font-medium text-text-2 mb-2">{t('admin.kycSettings.provider')}</div>
          <div className="flex gap-3">
            {['manual', 'sumsub'].map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={provider === p}
                  onChange={() => setProvider(p)}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-sm text-text-2">{p === 'manual' ? t('admin.kycSettings.providerManual') : 'Sumsub'}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {provider === 'sumsub' && (
        <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
          <h2 className="font-semibold text-text-1 mb-3">{t('admin.kycSettings.sumsubSettings')}</h2>
          <div className="space-y-3">
            {[
              { key: 'SUMSUB_APP_TOKEN', label: 'App Token', placeholder: 'app_t_' },
              { key: 'SUMSUB_SECRET_KEY', label: 'Secret Key', placeholder: 'sec_' },
              { key: 'SUMSUB_LEVEL_NAME', label: 'Level Name', placeholder: 'basic-kyc-level', secret: false },
              { key: 'SUMSUB_WEBHOOK_SECRET', label: 'Webhook Secret', placeholder: 'whsec_' },
            ].map(({ key, label, placeholder, secret = true }) => {
              const current = byKey[key] || { source: 'unset' };
              const badge = SOURCE_BADGE[current.source] || SOURCE_BADGE.unset;
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs font-medium text-text-2">{label}</label>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <input
                    type={secret ? 'password' : 'text'}
                    value={draft[key] ?? ''}
                    onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                    placeholder={current.source === 'unset' ? placeholder : t('admin.kycSettings.enterNewValue')}
                    className="w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
        >
          {saving ? t('admin.kycSettings.saving') : t('admin.kycSettings.save')}
        </button>
        {provider === 'sumsub' && (
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-text-2 hover:text-text-1 disabled:opacity-40 transition"
          >
            {testing ? t('admin.kycSettings.testing') : t('admin.kycSettings.testConnection')}
          </button>
        )}
      </div>
    </div>
  );
}
