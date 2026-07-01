import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSettingsStore, ACCENT_COLORS } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';

const SPORTS = [
  { id: 'football',   label: 'Futbol',     icon: '⚽' },
  { id: 'basketball', label: 'Basketbol',  icon: '🏀' },
  { id: 'tennis',     label: 'Tenis',      icon: '🎾' },
  { id: 'volleyball', label: 'Voleybol',   icon: '🏐' },
  { id: 'icehockey',  label: 'Buz Hokeyi', icon: '🏒' },
  { id: 'golf',       label: 'Golf',       icon: '⛳' },
  { id: 'handball',   label: 'Hentbol',    icon: '🤾' },
  { id: 'boxing',     label: 'Boks',       icon: '🥊' },
];

const AVATAR_COLORS = ['#7c3aed','#00d4ff','#10b981','#f97316','#ef4444','#f59e0b','#ec4899','#6366f1'];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-white/10'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function TabHesap() {
  const { user } = useAuthStore();
  const { preferences, updatePreference } = useSettingsStore();
  const addToast = useToastStore(s => s.add);
  const { register: regPw, handleSubmit: hsPw, reset: resetPw, formState: { isSubmitting: pwSubmitting } } = useForm();
  const { register: regEmail, handleSubmit: hsEmail, reset: resetEmail, formState: { isSubmitting: emailSubmitting } } = useForm();

  const onPassword = async ({ currentPassword, newPassword, confirmPassword }) => {
    if (newPassword !== confirmPassword) { addToast('Şifreler eşleşmiyor', 'error'); return; }
    try {
      await api.put('/users/me/password', { currentPassword, newPassword });
      addToast('Şifre güncellendi', 'success');
      resetPw();
    } catch(e) { addToast(e.response?.data?.error?.message || 'Hata', 'error'); }
  };

  const onEmail = async ({ email, password }) => {
    try {
      await api.put('/users/me/email', { email, password });
      addToast('E-posta güncellendi', 'success');
      resetEmail();
    } catch(e) { addToast(e.response?.data?.error?.message || 'Hata', 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-4">Avatar</h3>
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="shrink-0 w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-white shadow-xl ring-2 ring-white/10"
            style={{ backgroundColor: preferences.avatarColor, aspectRatio: '1 / 1' }}
          >
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: '#4a5a78' }}>
              Renk Seçin
            </div>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_COLORS.map(c => (
                <button key={c} onClick={() => updatePreference('avatarColor', c)}
                  className={`w-9 h-9 rounded-full border-2 transition-all ${
                    preferences.avatarColor === c
                      ? 'border-white scale-110 shadow-lg'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/5 text-sm text-text-2">
          <span className="font-semibold text-text-1">{user?.username}</span>
          <span className="mx-2 text-text-3">·</span>
          <span>{user?.email}</span>
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-4">Şifre Değiştir</h3>
        <form onSubmit={hsPw(onPassword)} className="space-y-3">
          {['currentPassword','newPassword','confirmPassword'].map((name, i) => (
            <input key={name} {...regPw(name, { required: true, minLength: name !== 'currentPassword' ? 6 : 1 })}
              type="password"
              placeholder={['Mevcut şifre','Yeni şifre (min. 6)','Yeni şifre tekrar'][i]}
              className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-primary" />
          ))}
          <button type="submit" disabled={pwSubmitting}
            className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50">
            Güncelle
          </button>
        </form>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-4">E-posta Değiştir</h3>
        <form onSubmit={hsEmail(onEmail)} className="space-y-3">
          <input {...regEmail('email', { required: true })} type="email" placeholder="Yeni e-posta"
            className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-primary" />
          <input {...regEmail('password', { required: true })} type="password" placeholder="Şifrenizi doğrulayın"
            className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-primary" />
          <button type="submit" disabled={emailSubmitting}
            className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50">
            Güncelle
          </button>
        </form>
      </div>
    </div>
  );
}

function TabGorunum() {
  const { preferences, updatePreference, isDirty, save } = useSettingsStore();
  const addToast = useToastStore(s => s.add);

  const toggleSport = (id) => {
    const favs = preferences.favoriteSports.includes(id)
      ? preferences.favoriteSports.filter(s => s !== id)
      : [...preferences.favoriteSports, id];
    updatePreference('favoriteSports', favs);
  };

  const onSave = async () => {
    try { await save(); addToast('Tercihler kaydedildi', 'success'); }
    catch { addToast('Kaydetme hatası', 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-1">Favori Sporlar</h3>
        <p className="text-xs text-text-3 mb-4">Seçilen sporlar sidebar'da en üstte gösterilir</p>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map(s => (
            <button key={s.id} onClick={() => toggleSport(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                preferences.favoriteSports.includes(s.id)
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-bg-base border-white/10 text-text-2 hover:border-white/30'
              }`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-4">Tema Rengi</h3>
        <div className="flex gap-3">
          {Object.entries(ACCENT_COLORS).map(([name, c]) => (
            <button key={name} onClick={() => updatePreference('accentColor', name)}
              className={`flex-1 py-3 rounded-xl border-2 transition-all text-xs font-bold capitalize ${
                preferences.accentColor === name ? 'border-white scale-105' : 'border-transparent hover:border-white/30'
              }`}
              style={{ backgroundColor: c.primary + '33', color: c.primary }}>
              {name === 'cyan' ? 'Cyan' : name === 'purple' ? 'Mor' : name === 'green' ? 'Yeşil' : 'Turuncu'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-4">Oran Formatı</h3>
        <div className="flex gap-2">
          {[['decimal','Ondalık (2.50)'],['fractional','Kesirli (3/2)'],['american','Amerikan (+150)']].map(([v,l]) => (
            <button key={v} onClick={() => updatePreference('oddsFormat', v)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                preferences.oddsFormat === v
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-bg-base border-white/10 text-text-2 hover:border-white/30'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-4">Dil</h3>
        <div className="flex gap-2">
          {[['tr','🇹🇷 Türkçe'],['en','🇬🇧 English']].map(([v,l]) => (
            <button key={v} onClick={() => updatePreference('language', v)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                preferences.language === v
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-bg-base border-white/10 text-text-2 hover:border-white/30'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      <button onClick={onSave} disabled={!isDirty}
        className="w-full py-3 bg-primary text-bg-deep font-bold rounded-xl hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
        {isDirty ? 'Kaydet' : 'Kaydedildi ✓'}
      </button>
    </div>
  );
}

function TabBildirimler() {
  const { preferences, updatePreference, isDirty, save } = useSettingsStore();
  const addToast = useToastStore(s => s.add);

  const onSave = async () => {
    try { await save(); addToast('Tercihler kaydedildi', 'success'); }
    catch { addToast('Kaydetme hatası', 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-bg-card border border-white/10 rounded-xl p-5 space-y-5">
        {[
          ['notifyLive', 'Canlı Maç Bildirimleri', 'Maç canlıya geçtiğinde in-app bildirim'],
          ['notifyOddsChange', 'Oran Değişimi', 'Favori sporlarınızdaki maçlarda oran değişince bildir'],
        ].map(([key, title, desc]) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-text-1">{title}</div>
              <div className="text-xs text-text-3 mt-0.5">{desc}</div>
            </div>
            <Toggle checked={preferences[key]} onChange={v => updatePreference(key, v)} />
          </div>
        ))}
      </div>

      <div className="bg-bg-card border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-1 mb-1">Varsayılan Bahis Miktarı</h3>
        <p className="text-xs text-text-3 mb-3">Bahis kuponu açıldığında otomatik doldurulur</p>
        <div className="flex items-center gap-3">
          <input type="number" min="1" value={preferences.defaultStake}
            onChange={e => updatePreference('defaultStake', +e.target.value)}
            className="w-32 bg-bg-base border border-white/10 rounded-lg px-4 py-2.5 text-text-1 text-sm focus:outline-none focus:border-primary" />
          <span className="text-text-3 text-sm">₺</span>
        </div>
      </div>

      <button onClick={onSave} disabled={!isDirty}
        className="w-full py-3 bg-primary text-bg-deep font-bold rounded-xl hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
        {isDirty ? 'Kaydet' : 'Kaydedildi ✓'}
      </button>
    </div>
  );
}

const TABS = [
  { id: 'hesap',        label: '👤 Hesap' },
  { id: 'gorunum',      label: '🎨 Görünüm' },
  { id: 'bildirimler',  label: '🔔 Bildirimler' },
];

export default function Settings() {
  const [tab, setTab] = useState('hesap');
  const { load } = useSettingsStore();

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-text-1 mb-6">Ayarlar</h1>
      <div className="flex gap-1 mb-6 bg-bg-card border border-white/10 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-accent text-white shadow' : 'text-text-2 hover:text-text-1'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'hesap' && <TabHesap />}
      {tab === 'gorunum' && <TabGorunum />}
      {tab === 'bildirimler' && <TabBildirimler />}
    </div>
  );
}
