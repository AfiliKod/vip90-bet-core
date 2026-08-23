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
 * Get crash game settings (for game server)
 */
export async function getCrashSettings() {
  return getGameSettings('inhouse-crash');
}

/**
 * Get roulette game settings (for game server)
 */
export async function getRouletteSettings() {
  return getGameSettings('inhouse-roulette');
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