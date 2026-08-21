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
  ];

  for (const game of games) {
    const existing = await GameSettings.findOne({ gameId: game.gameId });
    if (!existing) {
      await GameSettings.create(game);
    }
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
 */
export async function getAllGameSettings() {
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