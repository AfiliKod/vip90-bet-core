import GameSettings from '../models/GameSettings.js';
import { createError } from '../middleware/error.js';

/**
 * Initialize default game settings if not exist
 */
export async function initDefaultGameSettings() {
  const games = [
    {
      gameId: 'inhouse-crash',
      gameTitle: 'Crash',
      crashHouseEdgePercent: 20,
      crashMinBet: 1,
      crashMaxBet: 50000,
      crashAutoCashoutEnabled: true,
      crashTickMs: 100,
      crashWaitMs: 6000,
      crashShowMs: 3000,
    },
    {
      gameId: 'inhouse-roulette',
      gameTitle: 'European Roulette',
      rouletteHouseEdgePercent: 2.7,
      rouletteMinBet: 1,
      rouletteMaxBet: 50000,
      rouletteMaxPayout: 36,
      rouletteWaitMs: 5000,
      rouletteSpinMs: 4800,
      rouletteResultMs: 3000,
    },
    {
      gameId: 'inhouse-mines',
      gameTitle: 'Mines',
      minesPayoutFactor: 0.78,
      minesMinBet: 1,
      minesMaxBet: 50000,
    },
    {
      gameId: 'inhouse-dice',
      gameTitle: 'Dice',
      dicePayoutFactor: 78,
      diceMinBet: 1,
      diceMaxBet: 50000,
    },
    {
      gameId: 'inhouse-limbo',
      gameTitle: 'Limbo',
      limboHouseEdgePercent: 20,
      limboMinBet: 1,
      limboMaxBet: 50000,
    },
    {
      gameId: 'inhouse-hilo',
      gameTitle: 'Hi-Lo',
      hiloPayoutFactor: 0.78,
      hiloMinBet: 1,
      hiloMaxBet: 50000,
    },
    {
      gameId: 'inhouse-dragontiger',
      gameTitle: 'Dragon Tiger',
      dragonTigerWinMultiplier: 1.6,
      dragonTigerTieMultiplier: 13,
      dragonTigerTiePushMultiplier: 0.5,
      dragonTigerMinBet: 1,
      dragonTigerMaxBet: 50000,
    },
    {
      gameId: 'inhouse-plinko',
      gameTitle: 'Plinko',
      plinkoPayoutScale: 1.0,
      plinkoMinBet: 1,
      plinkoMaxBet: 50000,
    },
    {
      gameId: 'inhouse-wheel',
      gameTitle: 'Wheel',
      wheelPayoutScale: 1.0,
      wheelMinBet: 1,
      wheelMaxBet: 50000,
    },
    {
      gameId: 'inhouse-keno',
      gameTitle: 'Keno',
      kenoPayoutScale: 1.0,
      kenoMinBet: 1,
      kenoMaxBet: 50000,
    },
    {
      gameId: 'inhouse-baccarat',
      gameTitle: 'Baccarat',
      baccaratBankerMultiplier: 1.7,
      baccaratPlayerMultiplier: 1.75,
      baccaratTieMultiplier: 8,
      baccaratMinBet: 1,
      baccaratMaxBet: 50000,
    },
    {
      gameId: 'inhouse-blackjack',
      gameTitle: 'Blackjack',
      blackjackPayoutMult: 2.0,
      blackjackWinMult: 1.4,
      dealerHitsSoft17: true,
      blackjackMinBet: 1,
      blackjackMaxBet: 50000,
    },
    {
      gameId: 'inhouse-videopoker',
      gameTitle: 'Video Poker',
      vpRoyalFlushMult: 656,
      vpStraightFlushMult: 41,
      vpFourKindMult: 21,
      vpFullHouseMult: 7,
      vpFlushMult: 5,
      vpStraightMult: 3,
      vpThreeKindMult: 2.5,
      vpTwoPairMult: 1.5,
      vpJacksOrBetterMult: 0.8,
      vpMinBet: 1,
      vpMaxBet: 50000,
    },
  ];

  // find+create yerine atomik upsert: eşzamanlı çağrılar (crashGame.js ve
  // rouletteGame.js her ikisi de ilk turda bu fonksiyonu tetikleyebilir)
  // yarış durumunda çift kayıt oluşturmasın.
  for (const game of games) {
    const { gameId, ...defaults } = game;
    await GameSettings.updateOne(
      { gameId },
      { $setOnInsert: { gameId, ...defaults } },
      { upsert: true }
    );
  }
}

/**
 * Get game settings for a specific game
 */
export async function getGameSettings(gameId) {
  const settings = await GameSettings.findOne({ gameId });
  if (!settings) {
    await initDefaultGameSettings();
    return await GameSettings.findOne({ gameId });
  }
  return settings;
}

/**
 * Get all game settings (admin)
 *
 * initDefaultGameSettings() idempotent/atomik upsert olduğu için burada
 * her çağrıda tekrar tetiklemek güvenli — aksi halde admin paneli, henüz
 * hiç oynanmamış bir oyunun (dolayısıyla lazy-seed ile hiç DB kaydı
 * oluşmamış) ayarlarını hiç göstermezdi.
 */
export async function getAllGameSettings() {
  await initDefaultGameSettings();
  return GameSettings.find({}).sort({ gameId: 1 });
}

/**
 * Update game settings (admin)
 */
export async function updateGameSettings(gameId, updates, adminId, options = {}) {
  const { session = null, reason = '' } = options;

  const allowedFields = [
    // Crash
    'crashHouseEdgePercent', 'crashMinBet', 'crashMaxBet',
    'crashAutoCashoutEnabled', 'crashTickMs', 'crashWaitMs', 'crashShowMs',
    // Roulette
    'rouletteHouseEdgePercent', 'rouletteMinBet', 'rouletteMaxBet',
    'rouletteMaxPayout', 'rouletteWaitMs', 'rouletteSpinMs', 'rouletteResultMs',
    // Mines
    'minesPayoutFactor', 'minesMinBet', 'minesMaxBet',
    // Dice
    'dicePayoutFactor', 'diceMinBet', 'diceMaxBet',
    // Limbo
    'limboHouseEdgePercent', 'limboMinBet', 'limboMaxBet',
    // HiLo
    'hiloPayoutFactor', 'hiloMinBet', 'hiloMaxBet',
    // Dragon Tiger
    'dragonTigerWinMultiplier', 'dragonTigerTieMultiplier', 'dragonTigerTiePushMultiplier',
    'dragonTigerMinBet', 'dragonTigerMaxBet',
    // Plinko
    'plinkoPayoutScale', 'plinkoMinBet', 'plinkoMaxBet',
    // Wheel
    'wheelPayoutScale', 'wheelMinBet', 'wheelMaxBet',
    // Keno
    'kenoPayoutScale', 'kenoMinBet', 'kenoMaxBet',
    // Baccarat
    'baccaratBankerMultiplier', 'baccaratPlayerMultiplier', 'baccaratTieMultiplier',
    'baccaratMinBet', 'baccaratMaxBet',
    // Blackjack
    'blackjackPayoutMult', 'blackjackWinMult', 'dealerHitsSoft17',
    'blackjackMinBet', 'blackjackMaxBet',
    // Video Poker
    'vpRoyalFlushMult', 'vpStraightFlushMult', 'vpFourKindMult', 'vpFullHouseMult',
    'vpFlushMult', 'vpStraightMult', 'vpThreeKindMult', 'vpTwoPairMult', 'vpJacksOrBetterMult',
    'vpMinBet', 'vpMaxBet',
    // Common
    'isActive',
  ];

  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowedFields.includes(k))
  );

  if (Object.keys(updateData).length === 0) {
    throw createError(400, 'NO_VALID_FIELDS', 'Güncellenecek geçerli alan yok');
  }

  // Validate ranges
  if (updateData.crashHouseEdgePercent !== undefined) {
    if (updateData.crashHouseEdgePercent < 0 || updateData.crashHouseEdgePercent > 50) {
      throw createError(400, 'INVALID_RANGE', 'Crash house edge 0-50 aralığında olmalı');
    }
  }
  if (updateData.rouletteHouseEdgePercent !== undefined) {
    if (updateData.rouletteHouseEdgePercent < 0 || updateData.rouletteHouseEdgePercent > 10) {
      throw createError(400, 'INVALID_RANGE', 'Roulette house edge 0-10 aralığında olmalı');
    }
  }
  if (updateData.crashMinBet !== undefined && updateData.crashMinBet <= 0) {
    throw createError(400, 'INVALID_RANGE', 'Min bet pozitif olmalı');
  }
  if (updateData.crashMaxBet !== undefined && updateData.crashMaxBet < (updateData.crashMinBet || 0)) {
    throw createError(400, 'INVALID_RANGE', 'Max bet min betten büyük olmalı');
  }

  // Mines/Dice/Limbo/HiLo/Dragon Tiger — minBet/maxBet çapraz kontrolü.
  // Tekil alan aralıkları (ör. payoutFactor 0.5-0.99) zaten şema seviyesinde
  // (models/GameSettings.js) min/max ile korunuyor; burada yalnızca
  // şemanın ifade edemediği çapraz alan kısıtı (max >= min) kontrol ediliyor.
  for (const prefix of ['mines', 'dice', 'limbo', 'hilo', 'dragonTiger', 'plinko', 'wheel', 'keno', 'baccarat', 'blackjack', 'vp']) {
    const minKey = `${prefix}MinBet`;
    const maxKey = `${prefix}MaxBet`;
    if (updateData[minKey] !== undefined && updateData[minKey] <= 0) {
      throw createError(400, 'INVALID_RANGE', 'Min bet pozitif olmalı');
    }
    if (updateData[maxKey] !== undefined && updateData[maxKey] < (updateData[minKey] || 0)) {
      throw createError(400, 'INVALID_RANGE', 'Max bet min betten büyük olmalı');
    }
  }

  const settings = await GameSettings.findOne({ gameId }).session(session);
  if (!settings) throw createError(404, 'NOT_FOUND', 'Oyun ayarları bulunamadı');

  // Build change log
  const changes = [];
  for (const [key, newValue] of Object.entries(updateData)) {
    if (settings[key] !== newValue) {
      changes.push({
        field: key,
        oldValue: settings[key],
        newValue,
        changedBy: adminId,
        changedAt: new Date(),
        reason,
      });
    }
  }

  // Apply updates
  Object.assign(settings, updateData);
  settings.updatedBy = adminId;
  settings.updatedAt = new Date();
  settings.changeLog.push(...changes);
  await settings.save({ session });

  return { settings, changes };
}

/**
 * Operatör-bazlı Crash ayarı (bkz. server/src/provider/). Eski parametresiz
 * getCrashSettings() kaldırıldı — crashGame.js artık singleton değil, her
 * operatörün kendi izole GameSettings dokümanını kullanıyor (bkz.
 * models/GameSettings.js'teki operatorId + partial unique index çifti).
 * Yoksa Crash'in varsayılan değerleriyle (initDefaultGameSettings'teki
 * 'inhouse-crash' şablonuyla birebir) o operatöre özel lazy-seed yapılır.
 */
const OPERATOR_GAME_DEFAULTS = {
  'inhouse-crash': {
    gameTitle: 'Crash',
    crashHouseEdgePercent: 20,
    crashMinBet: 1,
    crashMaxBet: 50000,
    crashAutoCashoutEnabled: true,
    crashTickMs: 100,
    crashWaitMs: 6000,
    crashShowMs: 3000,
  },
  'inhouse-roulette': {
    gameTitle: 'European Roulette',
    rouletteHouseEdgePercent: 2.7,
    rouletteMinBet: 1,
    rouletteMaxBet: 50000,
    rouletteMaxPayout: 36,
    rouletteWaitMs: 5000,
    rouletteSpinMs: 4800,
    rouletteResultMs: 3000,
  },
  'inhouse-mines': {
    gameTitle: 'Mines',
    minesPayoutFactor: 0.78,
    minesMinBet: 1,
    minesMaxBet: 50000,
  },
  'inhouse-dice': {
    gameTitle: 'Dice',
    dicePayoutFactor: 78,
    diceMinBet: 1,
    diceMaxBet: 50000,
  },
  'inhouse-limbo': {
    gameTitle: 'Limbo',
    limboHouseEdgePercent: 20,
    limboMinBet: 1,
    limboMaxBet: 50000,
  },
  'inhouse-hilo': {
    gameTitle: 'Hi-Lo',
    hiloPayoutFactor: 0.78,
    hiloMinBet: 1,
    hiloMaxBet: 50000,
  },
  'inhouse-dragontiger': {
    gameTitle: 'Dragon Tiger',
    dragonTigerWinMultiplier: 1.6,
    dragonTigerTieMultiplier: 13,
    dragonTigerTiePushMultiplier: 0.5,
    dragonTigerMinBet: 1,
    dragonTigerMaxBet: 50000,
  },
  'inhouse-plinko': {
    gameTitle: 'Plinko',
    plinkoPayoutScale: 1.0,
    plinkoMinBet: 1,
    plinkoMaxBet: 50000,
  },
  'inhouse-wheel': {
    gameTitle: 'Wheel',
    wheelPayoutScale: 1.0,
    wheelMinBet: 1,
    wheelMaxBet: 50000,
  },
  'inhouse-keno': {
    gameTitle: 'Keno',
    kenoPayoutScale: 1.0,
    kenoMinBet: 1,
    kenoMaxBet: 50000,
  },
  'inhouse-baccarat': {
    gameTitle: 'Baccarat',
    baccaratBankerMultiplier: 1.7,
    baccaratPlayerMultiplier: 1.75,
    baccaratTieMultiplier: 8,
    baccaratMinBet: 1,
    baccaratMaxBet: 50000,
  },
  'inhouse-blackjack': {
    gameTitle: 'Blackjack',
    blackjackPayoutMult: 2.0,
    blackjackWinMult: 1.4,
    dealerHitsSoft17: true,
    blackjackMinBet: 1,
    blackjackMaxBet: 50000,
  },
  'inhouse-videopoker': {
    gameTitle: 'Video Poker',
    vpRoyalFlushMult: 656,
    vpStraightFlushMult: 41,
    vpFourKindMult: 21,
    vpFullHouseMult: 7,
    vpFlushMult: 5,
    vpStraightMult: 3,
    vpThreeKindMult: 2.5,
    vpTwoPairMult: 1.5,
    vpJacksOrBetterMult: 0.8,
    vpMinBet: 1,
    vpMaxBet: 50000,
  },
};

/** operatorId + gameId scoped ayar — yoksa o oyunun varsayılanlarıyla lazy-seed. */
async function getOperatorGameSettings(operatorId, gameId) {
  const existing = await GameSettings.findOne({ operatorId, gameId });
  if (existing) return existing;

  const defaults = OPERATOR_GAME_DEFAULTS[gameId];
  await GameSettings.updateOne(
    { operatorId, gameId },
    { $setOnInsert: { operatorId, gameId, ...defaults } },
    { upsert: true },
  );
  return GameSettings.findOne({ operatorId, gameId });
}

export async function getCrashSettingsForOperator(operatorId) {
  return getOperatorGameSettings(operatorId, 'inhouse-crash');
}

export async function getRouletteSettingsForOperator(operatorId) {
  return getOperatorGameSettings(operatorId, 'inhouse-roulette');
}

/** Jenerik operatör-bazlı ayar erişimi — HTTP oyun motoru (provider/services/instantGameEngine.js,
 *  sessionGameEngine.js) bunu kullanır. gameId TAM DB formatında olmalı (ör. 'inhouse-dice'). */
export async function getGameSettingsForOperator(operatorId, gameId) {
  return getOperatorGameSettings(operatorId, gameId);
}

// minKey/maxKey: her oyunun min/max bahis alan adları — jenerik çapraz
// doğrulama (max >= min) ve jenerik bahis-aralığı kontrolü (instantGameEngine.js)
// için. percentField: varsa [alan, min, max] — house-edge tipi tekil yüzde
// alanlarının aralık kontrolü.
const GAME_FIELD_META = {
  'inhouse-crash':       { minKey: 'crashMinBet', maxKey: 'crashMaxBet', percentField: ['crashHouseEdgePercent', 0, 50] },
  'inhouse-roulette':    { minKey: 'rouletteMinBet', maxKey: 'rouletteMaxBet', percentField: ['rouletteHouseEdgePercent', 0, 10] },
  'inhouse-mines':       { minKey: 'minesMinBet', maxKey: 'minesMaxBet' },
  'inhouse-dice':        { minKey: 'diceMinBet', maxKey: 'diceMaxBet' },
  'inhouse-limbo':       { minKey: 'limboMinBet', maxKey: 'limboMaxBet', percentField: ['limboHouseEdgePercent', 0, 50] },
  'inhouse-hilo':        { minKey: 'hiloMinBet', maxKey: 'hiloMaxBet' },
  'inhouse-dragontiger': { minKey: 'dragonTigerMinBet', maxKey: 'dragonTigerMaxBet' },
  'inhouse-plinko':      { minKey: 'plinkoMinBet', maxKey: 'plinkoMaxBet' },
  'inhouse-wheel':       { minKey: 'wheelMinBet', maxKey: 'wheelMaxBet' },
  'inhouse-keno':        { minKey: 'kenoMinBet', maxKey: 'kenoMaxBet' },
  'inhouse-baccarat':    { minKey: 'baccaratMinBet', maxKey: 'baccaratMaxBet' },
  'inhouse-blackjack':   { minKey: 'blackjackMinBet', maxKey: 'blackjackMaxBet' },
  'inhouse-videopoker':  { minKey: 'vpMinBet', maxKey: 'vpMaxBet' },
};

export function getGameFieldMeta(gameId) {
  return GAME_FIELD_META[gameId];
}

const OPERATOR_ALLOWED_FIELDS = {
  'inhouse-crash': [
    'crashHouseEdgePercent', 'crashMinBet', 'crashMaxBet',
    'crashAutoCashoutEnabled', 'crashTickMs', 'crashWaitMs', 'crashShowMs', 'isActive',
  ],
  'inhouse-roulette': [
    'rouletteHouseEdgePercent', 'rouletteMinBet', 'rouletteMaxBet',
    'rouletteMaxPayout', 'rouletteWaitMs', 'rouletteSpinMs', 'rouletteResultMs', 'isActive',
  ],
  'inhouse-mines': ['minesPayoutFactor', 'minesMinBet', 'minesMaxBet', 'isActive'],
  'inhouse-dice': ['dicePayoutFactor', 'diceMinBet', 'diceMaxBet', 'isActive'],
  'inhouse-limbo': ['limboHouseEdgePercent', 'limboMinBet', 'limboMaxBet', 'isActive'],
  'inhouse-hilo': ['hiloPayoutFactor', 'hiloMinBet', 'hiloMaxBet', 'isActive'],
  'inhouse-dragontiger': [
    'dragonTigerWinMultiplier', 'dragonTigerTieMultiplier', 'dragonTigerTiePushMultiplier',
    'dragonTigerMinBet', 'dragonTigerMaxBet', 'isActive',
  ],
  'inhouse-plinko': ['plinkoPayoutScale', 'plinkoMinBet', 'plinkoMaxBet', 'isActive'],
  'inhouse-wheel': ['wheelPayoutScale', 'wheelMinBet', 'wheelMaxBet', 'isActive'],
  'inhouse-keno': ['kenoPayoutScale', 'kenoMinBet', 'kenoMaxBet', 'isActive'],
  'inhouse-baccarat': [
    'baccaratBankerMultiplier', 'baccaratPlayerMultiplier', 'baccaratTieMultiplier',
    'baccaratMinBet', 'baccaratMaxBet', 'isActive',
  ],
  'inhouse-blackjack': [
    'blackjackPayoutMult', 'blackjackWinMult', 'dealerHitsSoft17',
    'blackjackMinBet', 'blackjackMaxBet', 'isActive',
  ],
  'inhouse-videopoker': [
    'vpRoyalFlushMult', 'vpStraightFlushMult', 'vpFourKindMult', 'vpFullHouseMult',
    'vpFlushMult', 'vpStraightMult', 'vpThreeKindMult', 'vpTwoPairMult', 'vpJacksOrBetterMult',
    'vpMinBet', 'vpMaxBet', 'isActive',
  ],
};

function validateOperatorUpdate(gameId, updateData) {
  const meta = GAME_FIELD_META[gameId];
  if (!meta) return;
  const { minKey, maxKey, percentField } = meta;
  if (percentField) {
    const [field, lo, hi] = percentField;
    if (updateData[field] !== undefined && (updateData[field] < lo || updateData[field] > hi)) {
      throw createError(400, 'INVALID_RANGE', `${field} ${lo}-${hi} aralığında olmalı`);
    }
  }
  if (updateData[minKey] !== undefined && updateData[minKey] <= 0) {
    throw createError(400, 'INVALID_RANGE', 'Min bet pozitif olmalı');
  }
  if (updateData[maxKey] !== undefined && updateData[maxKey] < (updateData[minKey] || 0)) {
    throw createError(400, 'INVALID_RANGE', 'Max bet min betten büyük olmalı');
  }
}

/** Operatörün KENDİ RTP/min-max/timing ayarını güncellemesi için (bkz. provider/routes/operatorSettings.js). */
export async function updateOperatorGameSettings(operatorId, gameId, updates, options = {}) {
  const { reason = '' } = options;
  const allowedFields = OPERATOR_ALLOWED_FIELDS[gameId];
  if (!allowedFields) throw createError(400, 'UNKNOWN_GAME', `Bilinmeyen oyun: ${gameId}`);

  const updateData = Object.fromEntries(Object.entries(updates).filter(([k]) => allowedFields.includes(k)));
  if (Object.keys(updateData).length === 0) {
    throw createError(400, 'NO_VALID_FIELDS', 'Güncellenecek geçerli alan yok');
  }
  validateOperatorUpdate(gameId, updateData);

  const settings = await getOperatorGameSettings(operatorId, gameId);
  const changes = [];
  for (const [key, newValue] of Object.entries(updateData)) {
    if (settings[key] !== newValue) {
      changes.push({ field: key, oldValue: settings[key], newValue, changedAt: new Date(), reason });
    }
  }
  Object.assign(settings, updateData);
  settings.updatedAt = new Date();
  settings.changeLog.push(...changes);
  await settings.save();
  return { settings, changes };
}

export async function getMinesSettings() {
  return getGameSettings('inhouse-mines');
}

export async function getDiceSettings() {
  return getGameSettings('inhouse-dice');
}

export async function getLimboSettings() {
  return getGameSettings('inhouse-limbo');
}

export async function getHiloSettings() {
  return getGameSettings('inhouse-hilo');
}

export async function getDragonTigerSettings() {
  return getGameSettings('inhouse-dragontiger');
}

export async function getPlinkoSettings() {
  return getGameSettings('inhouse-plinko');
}

export async function getWheelSettings() {
  return getGameSettings('inhouse-wheel');
}

export async function getKenoSettings() {
  return getGameSettings('inhouse-keno');
}

export async function getBaccaratSettings() {
  return getGameSettings('inhouse-baccarat');
}

export async function getBlackjackSettings() {
  return getGameSettings('inhouse-blackjack');
}

export async function getVideoPokerSettings() {
  return getGameSettings('inhouse-videopoker');
}