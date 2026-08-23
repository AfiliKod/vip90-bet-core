import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true }, // 'inhouse-crash', 'inhouse-roulette'
  gameTitle: { type: String, required: true },
  
  // Crash settings
  crashHouseEdgePercent: { type: Number, default: 20, min: 0, max: 50 }, // %20 = 1 in 5 instant crash
  crashMinBet: { type: Number, default: 1, min: 0.01 },
  crashMaxBet: { type: Number, default: 50000, min: 1 },
  crashAutoCashoutEnabled: { type: Boolean, default: true },
  crashTickMs: { type: Number, default: 100, min: 50 }, // game speed
  crashWaitMs: { type: Number, default: 6000, min: 1000 }, // betting window
  crashShowMs: { type: Number, default: 3000, min: 500 }, // result display
  
  // Roulette settings
  rouletteHouseEdgePercent: { type: Number, default: 2.7, min: 0, max: 10 }, // European roulette ~2.7%
  rouletteMinBet: { type: Number, default: 1, min: 0.01 },
  rouletteMaxBet: { type: Number, default: 50000, min: 1 },
  rouletteMaxPayout: { type: Number, default: 36 }, // straight up pays 36:1
  rouletteWaitMs: { type: Number, default: 5000, min: 1000 }, // betting window
  rouletteSpinMs: { type: Number, default: 4800, min: 1000 }, // animation
  rouletteResultMs: { type: Number, default: 3000, min: 500 }, // result display

  // Mines settings — payoutFactor = RTP (0.78 = %78)
  minesPayoutFactor: { type: Number, default: 0.78, min: 0.5, max: 0.99 },
  minesMinBet: { type: Number, default: 1, min: 0.01 },
  minesMaxBet: { type: Number, default: 50000, min: 1 },

  // Dice settings — payoutFactor = RTP (78 = %78, hedeften bağımsız sabit)
  dicePayoutFactor: { type: Number, default: 78, min: 50, max: 99 },
  diceMinBet: { type: Number, default: 1, min: 0.01 },
  diceMaxBet: { type: Number, default: 50000, min: 1 },

  // Limbo settings — crashHouseEdgePercent ile birebir aynı mekanizma
  limboHouseEdgePercent: { type: Number, default: 20, min: 0, max: 50 },
  limboMinBet: { type: Number, default: 1, min: 0.01 },
  limboMaxBet: { type: Number, default: 50000, min: 1 },

  // HiLo settings — payoutFactor = RTP (0.78 = %78)
  hiloPayoutFactor: { type: Number, default: 0.78, min: 0.5, max: 0.99 },
  hiloMinBet: { type: Number, default: 1, min: 0.01 },
  hiloMaxBet: { type: Number, default: 50000, min: 1 },

  // Dragon Tiger settings — 3 sabit ödeme oranı
  dragonTigerWinMultiplier: { type: Number, default: 1.6, min: 1.0, max: 2.0 },
  dragonTigerTieMultiplier: { type: Number, default: 13, min: 5, max: 15 },
  dragonTigerTiePushMultiplier: { type: Number, default: 0.5, min: 0, max: 1 },
  dragonTigerMinBet: { type: Number, default: 1, min: 0.01 },
  dragonTigerMaxBet: { type: Number, default: 50000, min: 1 },

  // Common
  isActive: { type: Boolean, default: true },
  
  // Audit
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },
  changeLog: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    reason: String,
  }],
}, { timestamps: true });

export default mongoose.model('GameSettings', schema);