import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

/**
 * O6 — Oyun limitleri, RTP ve bahis limitleri.
 *
 * Backend (services/gameSettings.js) zaten crashGame.js/rouletteGame.js
 * tarafından okunuyordu; buradan yapılan her kaydetme
 * invalidateCrashSettingsCache()/invalidateRouletteSettingsCache() ile
 * çalışan oyunu anında etkiler.
 *
 * Terminoloji: DB'de/kodda hâlâ "houseEdgePercent" olarak saklanıyor
 * (crashGame.js'in calcCrashPoint'i bu değeri doğrudan kullanıyor,
 * oyun mantığına dokunulmadı) ama operatörün asıl bildiği/aradığı terim
 * RTP olduğu için burada yalnızca SUNUM katmanında RTP = 100 − houseEdge
 * olarak gösterilip düzenleniyor; kaydederken tekrar houseEdge'e çevrilip
 * gönderiliyor. `rtp: true` işaretli alanlar bu dönüşümden geçiyor.
 *
 * Roulette'in "house edge"i DÜZENLENEBİLİR DEĞİL: rouletteGame.js sayı
 * üretimini `hash % 37` ile yapıyor (gerçek Avrupa ruleti, tek sıfır) —
 * rouletteHouseEdgePercent alanı kodun hiçbir yerinden okunmuyor, yani
 * eskiden burada düzenlenebilir bir alan olarak göstermek yanıltıcıydı.
 * Artık sabit/bilgilendirici bir satır olarak gösteriliyor.
 */

const ROULETTE_RTP_FIXED = 100 - (100 / 37); // ≈ %97,3 — 37 cepli tekerleğin matematiği

const CRASH_FIELDS = [
  { key: 'crashHouseEdgePercent', type: 'number', step: '0.1', rtp: true, min: 50, max: 100 },
  { key: 'crashMinBet', type: 'number', step: '0.01' },
  { key: 'crashMaxBet', type: 'number', step: '1' },
  { key: 'crashTickMs', type: 'number', step: '1' },
  { key: 'crashWaitMs', type: 'number', step: '1' },
  { key: 'crashShowMs', type: 'number', step: '1' },
];

const ROULETTE_FIELDS = [
  { key: 'rouletteMinBet', type: 'number', step: '0.01' },
  { key: 'rouletteMaxBet', type: 'number', step: '1' },
  { key: 'rouletteMaxPayout', type: 'number', step: '1' },
  { key: 'rouletteWaitMs', type: 'number', step: '1' },
  { key: 'rouletteSpinMs', type: 'number', step: '1' },
  { key: 'rouletteResultMs', type: 'number', step: '1' },
];

function toDisplay(f, raw) {
  if (!f.rtp) return raw;
  return raw === '' || raw == null ? '' : Math.round((100 - Number(raw)) * 10) / 10;
}

function fromDisplay(f, display) {
  if (!f.rtp) return display;
  return display === '' ? '' : Math.round((100 - Number(display)) * 10) / 10;
}

function GameCard({ t, settings, fields, onSave, busy, staticRtpNote }) {
  const [form, setForm] = useState(settings);

  useEffect(() => { setForm(settings); }, [settings]);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const changed = fields.some(f => Number(form[f.key]) !== Number(settings[f.key]))
    || form.isActive !== settings.isActive;

  return (
    <div className="bg-bg-card border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold">{settings.gameTitle}</div>
        <button
          onClick={() => setField('isActive', !form.isActive)}
          role="switch"
          aria-checked={form.isActive}
          aria-label={t('admin.gameSettings.toggleActive')}
          className={`relative w-12 h-6 rounded-full transition shrink-0 ${form.isActive ? 'bg-green-500/80' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-6' : ''}`} />
        </button>
      </div>

      {staticRtpNote && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-text-3">
          <span className="text-text-1 font-medium">{t('admin.gameSettings.rtpFixedLabel')}: {staticRtpNote}%</span>
          <div className="mt-0.5">{t('admin.gameSettings.rtpFixedNote')}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        {fields.map(f => (
          <label key={f.key} className="text-xs text-text-3">
            {t(`admin.gameSettings.field.${f.key}`)}
            <input
              type={f.type}
              step={f.step}
              min={f.min}
              max={f.max}
              value={toDisplay(f, form[f.key]) ?? ''}
              onChange={e => setField(f.key, e.target.value === '' ? '' : fromDisplay(f, e.target.value))}
              className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1 focus:outline-none focus:border-primary/50"
            />
          </label>
        ))}
      </div>

      <button
        onClick={() => onSave(form)}
        disabled={!changed || busy}
        className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 transition"
      >
        {busy ? t('admin.gameSettings.saving') : t('admin.gameSettings.save')}
      </button>
    </div>
  );
}

export default function AdminGameSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/admin/game-settings');
      setSettings(r.data.settings ?? []);
    } catch {
      setError(t('admin.gameSettings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function save(gameId, form) {
    setBusyId(gameId);
    setError('');
    try {
      const { _id, gameId: _g, gameTitle, createdAt, updatedAt, changeLog, __v, ...updates } = form;
      const r = await api.patch(`/admin/game-settings/${gameId}`, updates);
      setSettings(prev => prev.map(s => (s.gameId === gameId ? r.data.settings : s)));
    } catch {
      setError(t('admin.gameSettings.saveError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t('admin.gameSettings.title')}</h1>
      <p className="text-text-3 text-sm mb-6">{t('admin.gameSettings.subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-text-3">{t('admin.gameSettings.loading')}</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {settings.map(s => (
            <GameCard
              key={s.gameId}
              t={t}
              settings={s}
              fields={s.gameId === 'inhouse-crash' ? CRASH_FIELDS : ROULETTE_FIELDS}
              onSave={form => save(s.gameId, form)}
              busy={busyId === s.gameId}
              staticRtpNote={s.gameId === 'inhouse-roulette' ? ROULETTE_RTP_FIXED.toFixed(1) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
