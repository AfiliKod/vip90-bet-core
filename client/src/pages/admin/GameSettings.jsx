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
 * Terminoloji: DB'de/kodda hâlâ "houseEdgePercent"/"payoutFactor" olarak
 * saklanıyor (oyun mantığına dokunulmadı — crashGame.js/inhouse.js bu
 * alanları doğrudan kullanıyor) ama operatörün asıl bildiği/aradığı terim
 * RTP olduğu için burada yalnızca SUNUM katmanında dönüştürülüp
 * gösteriliyor/düzenleniyor; kaydederken ham forma çevrilip gönderiliyor.
 * `transform` alanı hangi dönüşümün uygulanacağını belirtir:
 *   - 'houseEdgeToRtp': RTP = 100 − houseEdge (Crash, Limbo)
 *   - 'fractionToPercent': RTP% = kesir × 100 (Mines, HiLo — DB'de 0-1 arası tutuluyor)
 *   - (yok): Dice'ın payoutFactor'ü zaten 0-100 ölçeğinde RTP'nin ta kendisi,
 *     dönüşüm gerekmez, doğrudan "RTP (%)" etiketiyle gösterilir.
 *
 * Roulette'in "house edge"i DÜZENLENEBİLİR DEĞİL: rouletteGame.js sayı
 * üretimini `hash % 37` ile yapıyor (gerçek Avrupa ruleti, tek sıfır) —
 * rouletteHouseEdgePercent alanı kodun hiçbir yerinden okunmuyor, yani
 * eskiden burada düzenlenebilir bir alan olarak göstermek yanıltıcıydı.
 * Artık sabit/bilgilendirici bir satır olarak gösteriliyor.
 */

const ROULETTE_RTP_FIXED = 100 - (100 / 37); // ≈ %97,3 — 37 cepli tekerleğin matematiği

/**
 * Dragon Tiger: tek 52'lik deste, her turda yeniden karılıyor
 * (routes/inhouse.js — buildDeck52 + dragonTigerDeal). Kartlardan biri
 * çekildikten sonra kalan 51 kartın 3'ü aynı ranktadır → P(berabere) = 3/51.
 * Kazanma/kaybetme olasılığı simetrik: (1 − 3/51) / 2.
 * Tek bir RTP alanı yok (3 farklı çarpan RTP'yi birlikte belirliyor),
 * bu yüzden admin'e canlı hesaplanan RTP önizlemesi gösteriliyor.
 */
const DRAGONTIGER_TIE_PROB = 3 / 51;
const DRAGONTIGER_WIN_PROB = (1 - DRAGONTIGER_TIE_PROB) / 2;

function dragonTigerRtp(form) {
  const win = Number(form.dragonTigerWinMultiplier) || 0;
  const tie = Number(form.dragonTigerTieMultiplier) || 0;
  const tiePush = Number(form.dragonTigerTiePushMultiplier) || 0;
  return {
    main: (DRAGONTIGER_WIN_PROB * win + DRAGONTIGER_TIE_PROB * tiePush) * 100,
    tie: DRAGONTIGER_TIE_PROB * tie * 100,
  };
}

const CRASH_FIELDS = [
  { key: 'crashHouseEdgePercent', type: 'number', step: '0.1', transform: 'houseEdgeToRtp', min: 50, max: 100 },
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

const MINES_FIELDS = [
  { key: 'minesPayoutFactor', type: 'number', step: '0.1', transform: 'fractionToPercent', min: 50, max: 99 },
  { key: 'minesMinBet', type: 'number', step: '0.01' },
  { key: 'minesMaxBet', type: 'number', step: '1' },
];

const DICE_FIELDS = [
  { key: 'dicePayoutFactor', type: 'number', step: '0.1', min: 50, max: 99 },
  { key: 'diceMinBet', type: 'number', step: '0.01' },
  { key: 'diceMaxBet', type: 'number', step: '1' },
];

const LIMBO_FIELDS = [
  { key: 'limboHouseEdgePercent', type: 'number', step: '0.1', transform: 'houseEdgeToRtp', min: 50, max: 100 },
  { key: 'limboMinBet', type: 'number', step: '0.01' },
  { key: 'limboMaxBet', type: 'number', step: '1' },
];

const HILO_FIELDS = [
  { key: 'hiloPayoutFactor', type: 'number', step: '0.1', transform: 'fractionToPercent', min: 50, max: 99 },
  { key: 'hiloMinBet', type: 'number', step: '0.01' },
  { key: 'hiloMaxBet', type: 'number', step: '1' },
];

const DRAGONTIGER_FIELDS = [
  { key: 'dragonTigerWinMultiplier', type: 'number', step: '0.01', min: 1.0, max: 2.0 },
  { key: 'dragonTigerTieMultiplier', type: 'number', step: '0.1', min: 5, max: 15 },
  { key: 'dragonTigerTiePushMultiplier', type: 'number', step: '0.05', min: 0, max: 1 },
  { key: 'dragonTigerMinBet', type: 'number', step: '0.01' },
  { key: 'dragonTigerMaxBet', type: 'number', step: '1' },
];

const FIELDS_BY_GAME = {
  'inhouse-crash': CRASH_FIELDS,
  'inhouse-roulette': ROULETTE_FIELDS,
  'inhouse-mines': MINES_FIELDS,
  'inhouse-dice': DICE_FIELDS,
  'inhouse-limbo': LIMBO_FIELDS,
  'inhouse-hilo': HILO_FIELDS,
  'inhouse-dragontiger': DRAGONTIGER_FIELDS,
};

// Tek bir RTP alanı yerine birden çok değişkenin RTP'yi birlikte belirlediği
// oyunlar için: canlı hesaplanan RTP önizlemesi. Her giriş { label, value }
// döndürür (value: 0-100 arası yüzde).
const RTP_CALC_BY_GAME = {
  'inhouse-dragontiger': (t, form) => {
    const r = dragonTigerRtp(form);
    return [
      { label: t('admin.gameSettings.dragonTiger.rtpMain'), value: r.main },
      { label: t('admin.gameSettings.dragonTiger.rtpTie'), value: r.tie },
    ];
  },
};

// Tek bir RTP alanına indirgenemeyen oyunlar için: alanların ne olduğunu ve
// RTP'yi nasıl etkilediğini anlatan bilgi kutusu (i18n anahtarı).
const INFO_NOTE_BY_GAME = {
  'inhouse-dragontiger': 'admin.gameSettings.dragonTiger.info',
};

function toDisplay(f, raw) {
  if (raw === '' || raw == null) return '';
  if (f.transform === 'houseEdgeToRtp') return Math.round((100 - Number(raw)) * 10) / 10;
  if (f.transform === 'fractionToPercent') return Math.round(Number(raw) * 1000) / 10;
  return raw;
}

function fromDisplay(f, display) {
  if (display === '') return '';
  if (f.transform === 'houseEdgeToRtp') return Math.round((100 - Number(display)) * 10) / 10;
  if (f.transform === 'fractionToPercent') return Math.round(Number(display) * 10) / 1000;
  return Number(display);
}

function GameCard({ t, settings, fields, onSave, busy, staticRtpNote, rtpCalc, infoNoteKey }) {
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

      {infoNoteKey && t(infoNoteKey) !== infoNoteKey && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-text-3 whitespace-pre-line">
          {t(infoNoteKey)}
        </div>
      )}

      {rtpCalc && (
        <div className="mb-4 flex flex-wrap gap-2">
          {rtpCalc(t, form).map(({ label, value }) => (
            <div key={label} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs">
              <span className="text-text-3">{label}: </span>
              <span className={`font-medium ${value < 90 ? 'text-amber-400' : 'text-text-1'}`}>
                {value.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        {fields.map(f => {
          const helpKey = `admin.gameSettings.field.${f.key}.help`;
          const help = t(helpKey);
          return (
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
              {help !== helpKey && <div className="mt-1 text-[11px] text-text-3/70 leading-snug">{help}</div>}
            </label>
          );
        })}
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
              fields={FIELDS_BY_GAME[s.gameId] ?? []}
              onSave={form => save(s.gameId, form)}
              busy={busyId === s.gameId}
              staticRtpNote={s.gameId === 'inhouse-roulette' ? ROULETTE_RTP_FIXED.toFixed(1) : null}
              rtpCalc={RTP_CALC_BY_GAME[s.gameId]}
              infoNoteKey={INFO_NOTE_BY_GAME[s.gameId]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
