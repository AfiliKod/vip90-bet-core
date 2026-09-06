import { z } from 'zod';
import { THEME_TOKEN_DEFINITIONS } from '../theme/registry.js';
import { THEME_PRESET_IDS } from '../theme/presets.js';
import { BRANDING_FIELD_DEFINITIONS } from '../branding/registry.js';
import { HOME_SECTION_IDS, HOME_BANNER_IDS } from '../pages/registry.js';
import { CURRENCY_DEFINITIONS } from '../currency/registry.js';

const MAX_FEATURED_GAMES = 60;

export const createEventSchema = z.object({
  sport: z.string().min(1), league: z.string().min(1), leagueFlag: z.string().optional(),
  homeTeam: z.object({ name: z.string(), country: z.string() }),
  awayTeam: z.object({ name: z.string(), country: z.string() }),
  startTime: z.string().datetime(),
  markets: z.array(z.object({
    type: z.string(), label: z.string(),
    odds: z.array(z.object({ id: z.string(), label: z.string(), value: z.number() }))
  }))
});
export const settleEventSchema = z.object({
  // Çoğu market tek kazananlı (string oddId). Çifte şans gibi çoklu-kazananlı
  // marketlerde birden fazla oddId aynı anda kazanabilir (array).
  results: z.record(z.union([z.string(), z.array(z.string())])),
  score: z.string().optional(),
});

export const createUserSchema = z.object({
  username:   z.string().min(3).max(30),
  email:      z.string().email(),
  password:   z.string().min(8),
  role:       z.enum(['user', 'admin']).default('user'),
  referredBy: z.string().min(3).max(30).optional(),
});

export const updateBalanceSchema = z.object({
  amount: z.number().positive(),
  type:   z.enum(['credit', 'debit', 'bonus']),
  note:   z.string().max(200).optional(),
});

const THEME_TOKEN_IDS = THEME_TOKEN_DEFINITIONS.map(t => t.id);

export const updateThemeSchema = z.object({
  id: z.enum(THEME_TOKEN_IDS),
  value: z.string().min(1).max(200),
});

export const applyThemePresetSchema = z.object({
  id: z.enum(THEME_PRESET_IDS),
});

// O6 — Oyun limitleri/RTP/house edge. Kesin aralık kontrolü (ör. house edge
// 0-50) services/gameSettings.js'te zaten yapılıyor; burası yalnızca tip
// güvenliği sağlar.
export const updateGameSettingsSchema = z.object({
  crashHouseEdgePercent: z.number().optional(),
  crashMinBet: z.number().positive().optional(),
  crashMaxBet: z.number().positive().optional(),
  crashAutoCashoutEnabled: z.boolean().optional(),
  crashTickMs: z.number().int().positive().optional(),
  crashWaitMs: z.number().int().positive().optional(),
  crashShowMs: z.number().int().positive().optional(),
  rouletteHouseEdgePercent: z.number().optional(),
  rouletteMinBet: z.number().positive().optional(),
  rouletteMaxBet: z.number().positive().optional(),
  rouletteMaxPayout: z.number().positive().optional(),
  rouletteWaitMs: z.number().int().positive().optional(),
  rouletteSpinMs: z.number().int().positive().optional(),
  rouletteResultMs: z.number().int().positive().optional(),
  minesPayoutFactor: z.number().optional(),
  minesMinBet: z.number().positive().optional(),
  minesMaxBet: z.number().positive().optional(),
  dicePayoutFactor: z.number().optional(),
  diceMinBet: z.number().positive().optional(),
  diceMaxBet: z.number().positive().optional(),
  limboHouseEdgePercent: z.number().optional(),
  limboMinBet: z.number().positive().optional(),
  limboMaxBet: z.number().positive().optional(),
  hiloPayoutFactor: z.number().optional(),
  hiloMinBet: z.number().positive().optional(),
  hiloMaxBet: z.number().positive().optional(),
  dragonTigerWinMultiplier: z.number().optional(),
  dragonTigerTieMultiplier: z.number().optional(),
  dragonTigerTiePushMultiplier: z.number().optional(),
  dragonTigerMinBet: z.number().positive().optional(),
  dragonTigerMaxBet: z.number().positive().optional(),
  plinkoPayoutScale: z.number().optional(),
  plinkoMinBet: z.number().positive().optional(),
  plinkoMaxBet: z.number().positive().optional(),
  wheelPayoutScale: z.number().optional(),
  wheelMinBet: z.number().positive().optional(),
  wheelMaxBet: z.number().positive().optional(),
  kenoPayoutScale: z.number().optional(),
  kenoMinBet: z.number().positive().optional(),
  kenoMaxBet: z.number().positive().optional(),
  baccaratBankerMultiplier: z.number().optional(),
  baccaratPlayerMultiplier: z.number().optional(),
  baccaratTieMultiplier: z.number().optional(),
  baccaratMinBet: z.number().positive().optional(),
  baccaratMaxBet: z.number().positive().optional(),
  blackjackPayoutMult: z.number().optional(),
  blackjackWinMult: z.number().optional(),
  dealerHitsSoft17: z.boolean().optional(),
  blackjackMinBet: z.number().positive().optional(),
  blackjackMaxBet: z.number().positive().optional(),
  vpRoyalFlushMult: z.number().optional(),
  vpStraightFlushMult: z.number().optional(),
  vpFourKindMult: z.number().optional(),
  vpFullHouseMult: z.number().optional(),
  vpFlushMult: z.number().optional(),
  vpStraightMult: z.number().optional(),
  vpThreeKindMult: z.number().optional(),
  vpTwoPairMult: z.number().optional(),
  vpJacksOrBetterMult: z.number().optional(),
  vpMinBet: z.number().positive().optional(),
  vpMaxBet: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  reason: z.string().max(300).optional(),
});

// Blackjack/Video Poker RTP simülasyonu — kaydedilmemiş aday ayarları kabul
// eder (admin kaydetmeden önce "bu ayarlarla RTP ne olur" görmek için).
// Yalnızca ilgili oyunun alanları + opsiyonel el sayısı.
export const simulateRtpSchema = z.object({
  blackjackPayoutMult: z.number().optional(),
  blackjackWinMult: z.number().optional(),
  dealerHitsSoft17: z.boolean().optional(),
  vpRoyalFlushMult: z.number().optional(),
  vpStraightFlushMult: z.number().optional(),
  vpFourKindMult: z.number().optional(),
  vpFullHouseMult: z.number().optional(),
  vpFlushMult: z.number().optional(),
  vpStraightMult: z.number().optional(),
  vpThreeKindMult: z.number().optional(),
  vpTwoPairMult: z.number().optional(),
  vpJacksOrBetterMult: z.number().optional(),
  hands: z.number().int().min(20000).max(500000).optional(),
});

const BRANDING_FIELD_IDS = BRANDING_FIELD_DEFINITIONS.map(f => f.id);
const BRANDING_FIELD_BY_ID = Object.fromEntries(BRANDING_FIELD_DEFINITIONS.map(f => [f.id, f]));

/** `data:<mime>;base64,<payload>` gövdesinden yaklaşık decode edilmiş byte sayısı. */
function approxDataUrlBytes(value) {
  const comma = value.indexOf(',');
  if (comma === -1) return Infinity; // biçimsiz — reddedilsin diye büyük say
  const payload = value.slice(comma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export const updateBrandingSchema = z.object({
  id: z.enum(BRANDING_FIELD_IDS),
  value: z.string().min(1),
}).refine(({ id, value }) => {
  const def = BRANDING_FIELD_BY_ID[id];
  if (def.type === 'text') return value.length <= def.maxLength;
  // image | font — sunucu dosya sistemine hiç dokunmadan taşınan data: URL
  if (!/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(value)) return false;
  return approxDataUrlBytes(value) <= def.maxBytes;
}, { message: 'Geçersiz değer: tür veya boyut sınırı aşıldı' });

export const updateHomeContentSchema = z.object({
  sectionOrder: z.array(z.enum(HOME_SECTION_IDS)).max(HOME_SECTION_IDS.length),
  banners: z.array(z.object({
    id:    z.enum(HOME_BANNER_IDS),
    title: z.string().min(1).max(80).optional(),
    desc:  z.string().min(1).max(200).optional(),
    cta:   z.string().min(1).max(40).optional(),
  })).max(HOME_BANNER_IDS.length),
});

export const updateFeaturedGamesSchema = z.object({
  codes: z.array(z.string().min(1).max(60)).max(MAX_FEATURED_GAMES),
});

// U4 — para birimi (yalnızca CURRENCY_DEFINITIONS'ta tanımlı kodlar kabul edilir)
export const updateCurrencySchema = z.object({
  code: z.enum(CURRENCY_DEFINITIONS.map(c => c.code)),
});

// U5 — saat dilimi (IANA doğrulaması services/timezone.js'te yapılıyor;
// burada yalnızca boş olmadığından emin olunuyor)
export const updateTimezoneSchema = z.object({
  timezone: z.string().min(1).max(100),
});

// O4 — kademeli yönetici yetkileri
export const createRoleSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, 'Yalnızca küçük harf, rakam, alt çizgi'),
  displayName: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  permissions: z.array(z.string()).max(100).optional(),
  priority: z.number().int().min(0).max(99).optional(), // sistem rolleri 100/90'ı ayrılmış tutar
});

export const updateRoleSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(z.string()).max(100).optional(),
  priority: z.number().int().min(0).max(99).optional(),
});

export const assignRoleSchema = z.object({
  roleId: z.string().min(1),
});

// O1 — VIP/seviye programı
export const upsertVipLevelSchema = z.object({
  level: z.number().int().min(1).max(20),
  name: z.string().min(1).max(40),
  xpRequired: z.number().min(0),
  cashbackPercent: z.number().min(0).max(100).optional(),
  rewardAmount: z.number().min(0).optional(),
  rewardType: z.enum(['balance', 'bonus']).optional(),
  benefits: z.array(z.string().max(120)).max(20).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(10).optional(),
  isActive: z.boolean().optional(),
});

// Kampanyalar/promosyonlar (Promotion modeli) — admin CRUD. Öncesinde tek
// yaratım yolu tek seferlik bir script'ti (scripts/add-deneme-bonusu-promotion.mjs);
// panelden yönetilebilir yüzey yoktu.
export const upsertPromotionSchema = z.object({
  id: z.string().min(1).optional(), // varsa güncelleme, yoksa yeni kayıt
  type: z.enum(['welcome', 'freeBet', 'reload', 'trial']),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  amount: z.number().min(0),
  minOdds: z.number().min(1).optional(),
  wageringMultiplier: z.number().min(0).optional(),
  deadlineDays: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
  gameWeights: z.record(z.string(), z.number()).optional(),
});

// P3 — bot oyuncular (User koleksiyonunda isBot:true)
export const createBotSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(100).optional(),
  botType: z.enum(['casual', 'aggressive', 'conservative', 'high_roller', 'bonus_hunter']).optional(),
  behavior: z.object({
    betIntervalMinMs: z.number().int().min(1000).optional(),
    betIntervalMaxMs: z.number().int().min(1000).optional(),
    minBetPercent: z.number().min(0.1).max(100).optional(),
    maxBetPercent: z.number().min(0.1).max(100).optional(),
    riskLevel: z.number().min(0).max(100).optional(),
  }).optional(),
  limits: z.object({
    maxDailyLoss: z.number().min(0).optional(),
    maxDailyBets: z.number().int().min(1).optional(),
    minBalanceToPlay: z.number().min(0).optional(),
  }).optional(),
  notes: z.string().max(300).optional(),
});

// Footer/statik sayfa yönetimi
export const upsertStaticPageSchema = z.object({
  title: z.string().min(1).max(120),
  intro: z.string().max(500).optional(),
  sections: z.array(z.object({
    title: z.string().min(1).max(120),
    content: z.array(z.string().min(1).max(2000)).max(50),
  })).max(30),
});

export const toggleStaticPageSchema = z.object({
  isEnabled: z.boolean(),
});

// Son Kazananlar simülasyonu (kozmetik, gerçek User/bakiye kullanmaz)
export const updateFakeWinnersSchema = z.object({
  enabled: z.boolean().optional(),
  poolMin: z.number().int().min(1).max(5000).optional(),
  poolMax: z.number().int().min(1).max(5000).optional(),
  intervalMinMs: z.number().int().min(1000).max(600_000).optional(),
  intervalMaxMs: z.number().int().min(1000).max(600_000).optional(),
  amountMin: z.number().min(1).max(10_000_000).optional(),
  amountMax: z.number().min(1).max(10_000_000).optional(),
  includeCasinoWins: z.boolean().optional(),
  includeBettingWins: z.boolean().optional(),
}).refine(d => d.poolMin === undefined || d.poolMax === undefined || d.poolMin <= d.poolMax, {
  message: 'poolMin, poolMax\'tan büyük olamaz',
}).refine(d => d.intervalMinMs === undefined || d.intervalMaxMs === undefined || d.intervalMinMs <= d.intervalMaxMs, {
  message: 'intervalMinMs, intervalMaxMs\'ten büyük olamaz',
}).refine(d => d.amountMin === undefined || d.amountMax === undefined || d.amountMin <= d.amountMax, {
  message: 'amountMin, amountMax\'tan büyük olamaz',
});

export const updateBotSchema = z.object({
  isActive: z.boolean().optional(),
  botType: z.enum(['casual', 'aggressive', 'conservative', 'high_roller', 'bonus_hunter']).optional(),
  behavior: z.object({
    betIntervalMinMs: z.number().int().min(1000).optional(),
    betIntervalMaxMs: z.number().int().min(1000).optional(),
    minBetPercent: z.number().min(0.1).max(100).optional(),
    maxBetPercent: z.number().min(0.1).max(100).optional(),
    riskLevel: z.number().min(0).max(100).optional(),
  }).optional(),
  limits: z.object({
    maxDailyLoss: z.number().min(0).optional(),
    maxDailyBets: z.number().int().min(1).optional(),
    minBalanceToPlay: z.number().min(0).optional(),
  }).optional(),
  notes: z.string().max(300).optional(),
});
