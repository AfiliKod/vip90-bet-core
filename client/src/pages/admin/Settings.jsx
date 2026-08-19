import { useEffect, useState } from 'react';
import api from '../../services/api';

const GROUPS = [
  {
    title: '📨 Telegram',
    hint: 'BotFather’dan bot oluşturup token’ı ve hedef sohbetin chat ID’sini girin.',
    keys: [
      { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', placeholder: '123456:ABC-DEF…' },
      { key: 'TELEGRAM_CHAT_ID',   label: 'Chat ID',   placeholder: '-1001234567890' },
    ],
  },
  {
    title: '🔗 Webhook',
    hint: 'Slack, Discord veya genel webhook adresi.',
    keys: [
      { key: 'ALERT_WEBHOOK_URL', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/…' },
    ],
  },
  {
    title: '✉️ E-posta',
    hint: 'Kritik alarmların düşeceği adres.',
    keys: [
      { key: 'ALERT_EMAIL_TO', label: 'Alıcı Adres', placeholder: 'admin@vip90.bet' },
    ],
  },
];

const SOURCE_BADGE = {
  db:    { label: 'Panel', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  env:   { label: '.env',  cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  unset: { label: 'Tanımsız', cls: 'bg-white/5 text-text-3 border-white/10' },
};

export default function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState(null);

  function load() {
    setLoading(true);
    api.get('/admin/settings/alerts')
      .then(r => setSettings(r.data.settings))
      .catch(() => setNotice({ type: 'error', text: 'Ayarlar yüklenemedi' }))
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
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Kaydedilemedi' });
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
      setNotice({ type: 'ok', text: `Test alarmı gönderildi: ${sent.join(', ')}` });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Test gönderilemedi' });
    } finally {
      setTesting(false);
    }
  }

  const dirty = Object.values(draft).some(v => v?.trim());

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-text-1">🔔 Alarm Kanalları</h1>
        <button
          onClick={runTest}
          disabled={testing || !anyConfigured}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-text-2 hover:text-text-1 disabled:opacity-40 transition"
        >
          {testing ? 'Gönderiliyor…' : 'Test gönder'}
        </button>
      </div>
      <p className="text-sm text-text-3 mb-6">
        Senkronizasyon kesintisi gibi kritik olaylar bu kanallara bildirilir. Hiçbiri
        tanımlı değilse alarmlar hiçbir yere gitmez.
      </p>

      {!loading && !anyConfigured && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          Tanımlı alarm kanalı yok — kritik olaylar şu an sessizce geçiyor.
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
                          placeholder={current.source === 'unset' ? placeholder : 'Değiştirmek için yeni değer girin'}
                          className="flex-1 bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
                        />
                        {current.source === 'db' && (
                          <button
                            onClick={() => save({ [key]: '' }, `${label} temizlendi`)}
                            disabled={saving}
                            className="px-3 rounded-lg text-xs border border-white/10 text-text-3 hover:text-red-300 hover:border-red-500/30 disabled:opacity-40 transition"
                          >
                            Temizle
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
                'Ayarlar kaydedildi',
              )}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            {dirty && (
              <button onClick={() => setDraft({})} className="text-xs text-text-3 hover:text-text-2">
                Vazgeç
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
