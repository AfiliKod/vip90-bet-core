import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import ConnectionSettingsLink from './components/ConnectionSettingsLink.jsx';
import InhouseAllowedGames from './components/InhouseAllowedGames.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminExpandRow, ActiveSwitch, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

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

/**
 * Plinko/Wheel/Keno: gerçek ödeme tablosuna (routes/inhouse.js —
 * PLINKO_MULT/WHEEL_SEGMENTS/KENO_PAYOUTS) doğrudan uygulanan tek bir
 * `payoutScale` çarpanı düzenlenebilir (bkz. Faz 2 planı — hücre bazlı
 * tam tablo editörü yerine tercih edilen tasarım). Aşağıdaki tablolar
 * yalnızca CANLI RTP ÖNİZLEMESİ için client'a kopyalandı — routes/
 * inhouse.js'teki gerçek tablolarla senkron tutulmalı.
 */
const PLINKO_MULT = {
  // low.16: routes/inhouse.js'teki NaN-bakiye hatası düzeltmesiyle senkron
  // (eksik uç değerler tablonun kendi geometrik oranıyla tamamlandı).
  low: { 16: [22.4, 12.6, 7.1, 1.6, 1.1, 0.9, 0.8, 0.4, 0.2, 0.4, 0.8, 0.9, 1.1, 1.6, 7.1, 12.6, 22.4] },
  medium: { 16: [87, 32, 7.9, 4, 2.4, 1.2, 0.8, 0.4, 0.2, 0.4, 0.8, 1.2, 2.4, 4, 7.9, 32, 87] },
  high: { 16: [789, 102, 20.5, 7.1, 3.2, 1.6, 0.6, 0.2, 0.1, 0.2, 0.6, 1.6, 3.2, 7.1, 20.5, 102, 789] },
};

const WHEEL_SEGMENTS = {
  low: [{ m: 0, w: 45 }, { m: 0.75, w: 30 }, { m: 1.5, w: 15 }, { m: 2.5, w: 7 }, { m: 4, w: 2 }, { m: 8, w: 1 }],
  medium: [{ m: 0, w: 62 }, { m: 0.5, w: 20 }, { m: 1.5, w: 10 }, { m: 4, w: 6 }, { m: 10, w: 1 }, { m: 18, w: 1 }],
  high: [{ m: 0, w: 87 }, { m: 0.5, w: 6 }, { m: 2, w: 4 }, { m: 8, w: 2 }, { m: 50, w: 1 }],
};

const KENO_PAYOUTS = {
  1: [0, 3.0], 2: [0, 0, 5.5], 3: [0, 0, 2.0, 11.8], 4: [0, 0, 1.2, 4.0, 23.7],
  5: [0, 0, 0.9, 1.6, 7.9, 63], 10: [0, 0, 0, 0.8, 0.9, 1.6, 4.0, 15.8, 79, 790, 7900],
};

function binomCoeff(n, k) {
  let res = 1;
  for (let i = 0; i < k; i++) res = res * (n - i) / (i + 1);
  return res;
}

function plinkoBaseRtp(risk) {
  const table = PLINKO_MULT[risk][16];
  const n = 16;
  let rtp = 0;
  for (let k = 0; k <= n; k++) rtp += (binomCoeff(n, k) / 2 ** n) * table[k];
  return rtp * 100;
}

function wheelBaseRtp(risk) {
  const segs = WHEEL_SEGMENTS[risk];
  const total = segs.reduce((a, s) => a + s.w, 0);
  return (segs.reduce((a, s) => a + s.w * s.m, 0) / total) * 100;
}

function kenoBaseRtpRange() {
  const N = 40, K = 10;
  let min = Infinity, max = -Infinity;
  for (const picks of Object.keys(KENO_PAYOUTS).map(Number)) {
    const table = KENO_PAYOUTS[picks];
    let rtp = 0;
    for (let k = 0; k <= picks; k++) rtp += (binomCoeff(K, k) * binomCoeff(N - K, picks - k) / binomCoeff(N, picks)) * (table[k] ?? 0);
    min = Math.min(min, rtp * 100);
    max = Math.max(max, rtp * 100);
  }
  return { min, max };
}

// Bakara: mekanik sabit (oyuncu kararı yok), standart 6 desteli bakara
// için yayınlanmış olasılıklar (Dragon Tiger'daki gibi kapalı-form).
const BACCARAT_PROB = { banker: 0.4586, player: 0.4462, tie: 0.0952 };

function baccaratRtp(form) {
  return {
    banker: BACCARAT_PROB.banker * (Number(form.baccaratBankerMultiplier) || 0) * 100,
    player: BACCARAT_PROB.player * (Number(form.baccaratPlayerMultiplier) || 0) * 100,
    tie: BACCARAT_PROB.tie * (Number(form.baccaratTieMultiplier) || 0) * 100,
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

const PLINKO_FIELDS = [
  { key: 'plinkoPayoutScale', type: 'number', step: '0.01', min: 0.5, max: 1.3 },
  { key: 'plinkoMinBet', type: 'number', step: '0.01' },
  { key: 'plinkoMaxBet', type: 'number', step: '1' },
];

const WHEEL_FIELDS = [
  { key: 'wheelPayoutScale', type: 'number', step: '0.01', min: 0.5, max: 1.3 },
  { key: 'wheelMinBet', type: 'number', step: '0.01' },
  { key: 'wheelMaxBet', type: 'number', step: '1' },
];

const KENO_FIELDS = [
  { key: 'kenoPayoutScale', type: 'number', step: '0.01', min: 0.5, max: 1.3 },
  { key: 'kenoMinBet', type: 'number', step: '0.01' },
  { key: 'kenoMaxBet', type: 'number', step: '1' },
];

const BACCARAT_FIELDS = [
  { key: 'baccaratBankerMultiplier', type: 'number', step: '0.01', min: 1.5, max: 2.0 },
  { key: 'baccaratPlayerMultiplier', type: 'number', step: '0.01', min: 1.5, max: 2.0 },
  { key: 'baccaratTieMultiplier', type: 'number', step: '0.5', min: 4, max: 15 },
  { key: 'baccaratMinBet', type: 'number', step: '0.01' },
  { key: 'baccaratMaxBet', type: 'number', step: '1' },
];

const BLACKJACK_FIELDS = [
  { key: 'blackjackPayoutMult', type: 'number', step: '0.05', min: 1.5, max: 2.5 },
  { key: 'blackjackWinMult', type: 'number', step: '0.05', min: 1.0, max: 2.0 },
  { key: 'blackjackMinBet', type: 'number', step: '0.01' },
  { key: 'blackjackMaxBet', type: 'number', step: '1' },
];
const BLACKJACK_BOOL_FIELDS = [{ key: 'dealerHitsSoft17' }];

const VIDEOPOKER_FIELDS = [
  { key: 'vpRoyalFlushMult', type: 'number', step: '1', min: 100, max: 1000 },
  { key: 'vpStraightFlushMult', type: 'number', step: '1', min: 10, max: 100 },
  { key: 'vpFourKindMult', type: 'number', step: '1', min: 5, max: 50 },
  { key: 'vpFullHouseMult', type: 'number', step: '0.5', min: 1, max: 15 },
  { key: 'vpFlushMult', type: 'number', step: '0.5', min: 1, max: 15 },
  { key: 'vpStraightMult', type: 'number', step: '0.5', min: 1, max: 10 },
  { key: 'vpThreeKindMult', type: 'number', step: '0.5', min: 0.5, max: 5 },
  { key: 'vpTwoPairMult', type: 'number', step: '0.5', min: 0.5, max: 5 },
  { key: 'vpJacksOrBetterMult', type: 'number', step: '0.1', min: 0.5, max: 3 },
  { key: 'vpMinBet', type: 'number', step: '0.01' },
  { key: 'vpMaxBet', type: 'number', step: '1' },
];

const FIELDS_BY_GAME = {
  'inhouse-crash': CRASH_FIELDS,
  'inhouse-roulette': ROULETTE_FIELDS,
  'inhouse-mines': MINES_FIELDS,
  'inhouse-dice': DICE_FIELDS,
  'inhouse-limbo': LIMBO_FIELDS,
  'inhouse-hilo': HILO_FIELDS,
  'inhouse-dragontiger': DRAGONTIGER_FIELDS,
  'inhouse-plinko': PLINKO_FIELDS,
  'inhouse-wheel': WHEEL_FIELDS,
  'inhouse-keno': KENO_FIELDS,
  'inhouse-baccarat': BACCARAT_FIELDS,
  'inhouse-blackjack': BLACKJACK_FIELDS,
  'inhouse-videopoker': VIDEOPOKER_FIELDS,
};

const RISK_LABEL_KEYS = {
  low: 'admin.gameSettings.risk.low',
  medium: 'admin.gameSettings.risk.medium',
  high: 'admin.gameSettings.risk.high',
};

const FIELD_LABEL_KEYS = Object.fromEntries(
  [...Object.values(FIELDS_BY_GAME).flat(), ...BLACKJACK_BOOL_FIELDS].map(field => [field.key, `admin.gameSettings.field.${field.key}`]),
);

function fieldLabel(t, key) {
  const labelKey = FIELD_LABEL_KEYS[key];
  return labelKey ? t(labelKey) : key;
}

function fieldHelp(t, key) {
  const labelKey = FIELD_LABEL_KEYS[key];
  if (!labelKey) return '';
  const helpKey = `${labelKey}.help`;
  const value = t(helpKey);
  return value === helpKey ? '' : value;
}

const BOOL_FIELDS_BY_GAME = {
  'inhouse-blackjack': BLACKJACK_BOOL_FIELDS,
};

// Blackjack/Video Poker RTP'si oyuncu kararına bağlı — sunucuda Monte Carlo
// simülasyonuyla tahmin edilir ("Hesapla" butonu). Bu liste, hangi alanların
// simülasyona gönderileceğini belirtir (bahis limitleri RTP'yi etkilemediği
// için dahil edilmez).
const SIM_FIELDS_BY_GAME = {
  'inhouse-blackjack': ['blackjackPayoutMult', 'blackjackWinMult', 'dealerHitsSoft17'],
  'inhouse-videopoker': [
    'vpRoyalFlushMult', 'vpStraightFlushMult', 'vpFourKindMult', 'vpFullHouseMult',
    'vpFlushMult', 'vpStraightMult', 'vpThreeKindMult', 'vpTwoPairMult', 'vpJacksOrBetterMult',
  ],
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
  'inhouse-plinko': (t, form) => {
    const scale = Number(form.plinkoPayoutScale) || 0;
    return ['low', 'medium', 'high'].map(risk => ({
      label: RISK_LABEL_KEYS[risk] ? t(RISK_LABEL_KEYS[risk]) : risk,
      value: plinkoBaseRtp(risk) * scale,
    }));
  },
  'inhouse-wheel': (t, form) => {
    const scale = Number(form.wheelPayoutScale) || 0;
    return ['low', 'medium', 'high'].map(risk => ({
      label: RISK_LABEL_KEYS[risk] ? t(RISK_LABEL_KEYS[risk]) : risk,
      value: wheelBaseRtp(risk) * scale,
    }));
  },
  'inhouse-keno': (t, form) => {
    const scale = Number(form.kenoPayoutScale) || 0;
    const { min, max } = kenoBaseRtpRange();
    return [
      { label: t('admin.gameSettings.keno.rtpMin'), value: min * scale },
      { label: t('admin.gameSettings.keno.rtpMax'), value: max * scale },
    ];
  },
  'inhouse-baccarat': (t, form) => {
    const r = baccaratRtp(form);
    return [
      { label: t('admin.gameSettings.baccarat.rtpBanker'), value: r.banker },
      { label: t('admin.gameSettings.baccarat.rtpPlayer'), value: r.player },
      { label: t('admin.gameSettings.baccarat.rtpTie'), value: r.tie },
    ];
  },
};

// Tek bir RTP alanına indirgenemeyen oyunlar için: alanların ne olduğunu ve
// RTP'yi nasıl etkilediğini anlatan bilgi kutusu (i18n anahtarı).
const INFO_NOTE_BY_GAME = {
  'inhouse-dragontiger': 'admin.gameSettings.dragonTiger.info',
  'inhouse-plinko': 'admin.gameSettings.payoutScale.info',
  'inhouse-wheel': 'admin.gameSettings.payoutScale.info',
  'inhouse-keno': 'admin.gameSettings.payoutScale.info',
  'inhouse-baccarat': 'admin.gameSettings.baccarat.info',
  'inhouse-blackjack': 'admin.gameSettings.simulate.info',
  'inhouse-videopoker': 'admin.gameSettings.simulate.info',
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

/** Blackjack/Video Poker: RTP oyuncu kararına bağlı, kapalı formda hesaplanamaz.
 * Sunucuda gerçek oyun mantığıyla (kaydedilmemiş form değerleriyle) Monte
 * Carlo simülasyonu çalıştırır — tam kombinatorik/kesin RTP DEĞİL, ±güven
 * aralığıyla bir tahmin.
 */
function SimulateRtpButton({ t, gameId, form, simFields }) {
  const fmt = useFormatters();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  async function run() {
    setLoading(true);
    setErr(false);
    setResult(null);
    try {
      const payload = Object.fromEntries(simFields.map(key => [key, form[key]]));
      const r = await api.post(`/admin/game-settings/${gameId}/simulate-rtp`, payload);
      setResult(r.data);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-bg-deep px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-text-3">
          <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">casino</span>
          {t('admin.gameSettings.simulate.label')}
        </span>
        <button
          onClick={run}
          disabled={loading}
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2.5 text-xs font-bold text-text-2 transition hover:text-text-1 disabled:opacity-40"
        >
          <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">calculate</span>
          {loading ? t('admin.gameSettings.simulate.running') : t('admin.gameSettings.simulate.button')}
        </button>
      </div>
      {result && (
        <div className="mt-2 font-medium text-text-1">
          <span className="font-mono tabular-nums">RTP: {fmt.formatPercent(result.rtp / 100)} ± {fmt.formatPercent(result.marginOfError / 100)}</span>
          <span className="font-normal text-text-3"> ({fmt.formatNumber(result.hands)} {t('admin.gameSettings.simulate.hands')})</span>
        </div>
      )}
      {err && <div className="mt-2 text-danger">{t('admin.gameSettings.saveError')}</div>}
    </div>
  );
}

/** Evrensel sütunlar: RTP / Min / Max — oyuna özgü kalan alanlar accordion'da. */
function universalFields(fields) {
  const rtp = fields.find(f =>
    f.transform === 'houseEdgeToRtp'
    || f.transform === 'fractionToPercent'
    || f.key.endsWith('PayoutFactor')
  );
  const min = fields.find(f => f.key.endsWith('MinBet'));
  const max = fields.find(f => f.key.endsWith('MaxBet'));
  const rest = fields.filter(f => f !== rtp && f !== min && f !== max);
  return { rtp, min, max, rest };
}

function rowRtpDisplay({ staticRtpNote, rtpCalc, rtpField, form, t, fmt }) {
  const pct = v => (typeof v === 'number' && Number.isFinite(v) ? fmt.formatPercent(v / 100) : '—');
  if (staticRtpNote) return pct(Number(staticRtpNote));
  if (rtpCalc) {
    const first = rtpCalc(t, form)[0];
    return first ? pct(first.value) : '—';
  }
  if (rtpField) {
    const v = toDisplay(rtpField, form[rtpField.key]);
    return v === '' || v == null ? '—' : pct(Number(v));
  }
  return '—';
}

function GameRow({
  t,
  fmt,
  settings,
  fields,
  boolFields = [],
  onSave,
  busy,
  staticRtpNote,
  rtpCalc,
  infoNoteKey,
  simFields,
  expanded,
  onToggle,
}) {
  const [form, setForm] = useState(settings);

  useEffect(() => { setForm(settings); }, [settings]);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const { rtp, min, max, rest } = universalFields(fields);

  const changed = fields.some(f => Number(form[f.key]) !== Number(settings[f.key]))
    || boolFields.some(f => form[f.key] !== settings[f.key])
    || form.isActive !== settings.isActive;

  const cellInput = (f) => (
    <input
      type={f.type}
      step={f.step}
      min={f.min}
      max={f.max}
      value={toDisplay(f, form[f.key]) ?? ''}
      onChange={e => setField(f.key, e.target.value === '' ? '' : fromDisplay(f, e.target.value))}
      className="h-8 w-24 rounded-lg border border-white/10 bg-bg-deep px-2 text-sm tabular-nums text-text-1 focus:border-white/25 focus:outline-none"
    />
  );

  return (
    <>
      <AdminTableRow>
        <AdminTableCell>
          <div className="font-medium text-text-1">{settings.gameTitle}</div>
        </AdminTableCell>
        <AdminTableCell className="text-text-2 tabular-nums">
          {staticRtpNote || rtpCalc
            ? rowRtpDisplay({ staticRtpNote, rtpCalc, rtpField: rtp, form, t, fmt })
            : rtp ? cellInput(rtp) : '—'}
        </AdminTableCell>
        <AdminTableCell className="text-text-2 tabular-nums">{min ? cellInput(min) : '—'}</AdminTableCell>
        <AdminTableCell className="text-text-2 tabular-nums">{max ? cellInput(max) : '—'}</AdminTableCell>
        <AdminTableCell>
          <ActiveSwitch
            checked={!!form.isActive}
            onChange={() => setField('isActive', !form.isActive)}
            label={t('admin.gameSettings.toggleActive')}
          />
        </AdminTableCell>
        <AdminTableActionsCell>
          <RowActions
            label={t('admin.gameSettings.columnDetails')}
            items={[
              { key: 'save', label: busy ? t('admin.gameSettings.saving') : t('admin.gameSettings.save'), icon: 'save', tone: 'success', disabled: !changed || busy, onClick: () => onSave(form) },
              { key: 'details', label: expanded ? t('admin.gameSettings.collapseDetails') : t('admin.gameSettings.expandDetails'), icon: expanded ? 'expand_less' : 'expand_more', onClick: onToggle },
            ]}
          />
        </AdminTableActionsCell>
      </AdminTableRow>

      <AdminExpandRow colSpan={6} open={expanded}>
        {staticRtpNote && (
          <div className="mb-4 rounded-xl border border-white/10 bg-bg-deep px-3 py-2.5 text-xs text-text-3">
            <span className="font-mono font-semibold tabular-nums text-text-1">
              {t('admin.gameSettings.rtpFixedLabel')}: {fmt.formatPercent(Number(staticRtpNote) / 100)}
            </span>
            <div className="mt-0.5">{t('admin.gameSettings.rtpFixedNote')}</div>
          </div>
        )}

        {infoNoteKey && t(infoNoteKey) !== infoNoteKey && (
          <div className="mb-4 whitespace-pre-line rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-text-3">
            {t(infoNoteKey)}
          </div>
        )}

        {rtpCalc && (
          <div className="mb-4 flex flex-wrap gap-2">
            {rtpCalc(t, form).map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-xs">
                <span className="text-text-3">{label}: </span>
                <span className={`font-mono font-bold tabular-nums ${value < 90 ? 'text-warning' : 'text-text-1'}`}>
                  {fmt.formatPercent(value / 100)}
                </span>
              </div>
            ))}
          </div>
        )}

        {simFields && <SimulateRtpButton t={t} gameId={settings.gameId} form={form} simFields={simFields} />}

        {boolFields.map(f => {
          const help = fieldHelp(t, f.key);
          return (
            <div key={f.key} className="mb-3 rounded-lg border border-white/10 bg-bg-deep px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-3">{fieldLabel(t, f.key)}</span>
                <ActiveSwitch
                  checked={!!form[f.key]}
                  onChange={() => setField(f.key, !form[f.key])}
                  label={fieldLabel(t, f.key)}
                />
              </div>
              {help && <div className="mt-1 text-[11px] text-text-3/70 leading-snug">{help}</div>}
            </div>
          );
        })}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {rest.map(f => {
            const help = fieldHelp(t, f.key);
            return (
              <label key={f.key} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                {fieldLabel(t, f.key)}
                <input
                  type={f.type}
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={toDisplay(f, form[f.key]) ?? ''}
                  onChange={e => setField(f.key, e.target.value === '' ? '' : fromDisplay(f, e.target.value))}
                  className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm tabular-nums text-text-1 focus:border-white/25 focus:outline-none"
                />
                {help && <div className="mt-1 text-[11px] text-text-3/70 leading-snug">{help}</div>}
              </label>
            );
          })}
        </div>

        <button
          onClick={() => onSave(form)}
          disabled={!changed || busy}
          className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
        >
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
          {busy ? t('admin.gameSettings.saving') : t('admin.gameSettings.save')}
        </button>
      </AdminExpandRow>
    </>
  );
}

export default function AdminGameSettings() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

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
      const updates = Object.fromEntries(
        Object.entries(form).filter(([key]) => !['_id', 'gameId', 'gameTitle', 'createdAt', 'updatedAt', 'changeLog', '__v'].includes(key)),
      );
      const r = await api.patch(`/admin/game-settings/${gameId}`, updates);
      setSettings(prev => prev.map(s => (s.gameId === gameId ? r.data.settings : s)));
    } catch {
      setError(t('admin.gameSettings.saveError'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupProducts') }, { label: t('admin.gameSettings.title') }]}
        title={t('admin.gameSettings.title')}
        sub={t('admin.gameSettings.subtitle')}
        actions={<ConnectionSettingsLink />}
      />

      <InhouseAllowedGames />

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
          <div className="mt-2 text-sm text-text-3">{t('admin.gameSettings.loading')}</div>
        </div>
      ) : (
        <>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">tune</span>
          </span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.gameSettings.title')}</h3>
          <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
            {settings.length.toLocaleString(locale)}
          </span>
        </div>
        <AdminTable
          columns={[
            { key: 'game', label: t('admin.gameSettings.title') },
            { key: 'rtp', label: t('admin.gameSettings.columnRtp') },
            { key: 'min', label: t('admin.gameSettings.columnMinBet') },
            { key: 'max', label: t('admin.gameSettings.columnMaxBet') },
            { key: 'active', label: t('admin.gameSettings.columnActive') },
            { key: 'actions', label: t('admin.gameSettings.columnDetails'), align: 'right' },
          ]}
        >
          {settings.length === 0 && (
            <tr>
              <td colSpan={6} className="p-0">
                <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
                  <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">sports_esports</span>
                  <div className="mt-2 text-sm text-text-3">{t('admin.gameSettings.noGames')}</div>
                </div>
              </td>
            </tr>
          )}
          {settings.map(s => (
            <GameRow
              key={s.gameId}
              t={t}
              fmt={fmt}
              settings={s}
              fields={FIELDS_BY_GAME[s.gameId] ?? []}
              onSave={form => save(s.gameId, form)}
              busy={busyId === s.gameId}
              staticRtpNote={s.gameId === 'inhouse-roulette' ? ROULETTE_RTP_FIXED.toFixed(1) : null}
              rtpCalc={RTP_CALC_BY_GAME[s.gameId]}
              infoNoteKey={INFO_NOTE_BY_GAME[s.gameId]}
              boolFields={BOOL_FIELDS_BY_GAME[s.gameId] ?? []}
              simFields={SIM_FIELDS_BY_GAME[s.gameId]}
              expanded={expandedId === s.gameId}
              onToggle={() => setExpandedId(id => (id === s.gameId ? null : s.gameId))}
            />
          ))}
        </AdminTable>
        </>
      )}
    </div>
  );
}
