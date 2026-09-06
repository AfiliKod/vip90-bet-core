import { useEffect, useState } from 'react';
import api from '../../services/api';

const SOURCE_BADGE = {
  db:      { label: 'Panel', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  env:     { label: '.env',  cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  default: { label: 'Varsayilan', cls: 'bg-white/5 text-text-3 border-white/10' },
  unset:   { label: 'Tanimsiz', cls: 'bg-white/5 text-text-3 border-white/10' },
};

export default function AdminKycSettings() {
  const [settings, setSettings] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [kyEnabled, setKyEnabled] = useState(true);
  const [provider, setProvider] = useState('manual');

  useEffect(() => {
    api.get('/admin/kyc-settings')
      .then(r => {
        setSettings(r.data.settings);
        const map = Object.fromEntries(r.data.settings.map(s => [s.key, s.rawValue || s.value || '']));
        setKyEnabled(map.KYC_ENABLED !== 'false');
        setProvider(map.KYC_PROVIDER || 'manual');
      })
      .catch(() => setNotice({ type: 'error', text: 'KYC ayarlari yuklenemedi.' }))
      .finally(() => setLoading(false));
  }, []);

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
      setNotice({ type: 'ok', text: 'KYC ayarlari kaydedildi.' });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Kaydetme basarisiz.' });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setNotice(null);
    try {
      await api.post('/admin/kyc-settings/test');
      setNotice({ type: 'ok', text: 'Sumsub baglantisi basarili.' });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Test basarisiz.' });
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
      <h1 className="text-2xl font-bold text-text-1 mb-6">KYC Ayarlari</h1>

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          notice.type === 'ok'
            ? 'border-green-500/30 bg-green-500/10 text-green-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          {notice.text}
        </div>
      )}

      <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
        <h2 className="font-semibold text-text-1 mb-3">Genel Ayarlar</h2>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-text-2">KYC Aktif</div>
            <div className="text-xs text-text-3">KYC dogrulamasini aktif/pasif yapar</div>
          </div>
          <button
            onClick={() => setKyEnabled(v => !v)}
            role="switch"
            aria-checked={kyEnabled}
            className={`relative w-12 h-6 rounded-full transition shrink-0 ${kyEnabled ? 'bg-green-500/80' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${kyEnabled ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        <div className="mb-4">
          <div className="text-sm font-medium text-text-2 mb-2">Saglayici</div>
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
                <span className="text-sm text-text-2">{p === 'manual' ? 'Manuel' : 'Sumsub'}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {provider === 'sumsub' && (
        <div className="bg-bg-card border border-white/10 rounded-xl p-4 mb-4">
          <h2 className="font-semibold text-text-1 mb-3">Sumsub Ayarlari</h2>
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
                    placeholder={current.source === 'unset' ? placeholder : 'Yeni deger girin...'}
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
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        {provider === 'sumsub' && (
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-white/10 text-text-2 hover:text-text-1 disabled:opacity-40 transition"
          >
            {testing ? 'Test ediliyor...' : 'Baglanti Testi'}
          </button>
        )}
      </div>
    </div>
  );
}
