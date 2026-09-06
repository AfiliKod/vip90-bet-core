import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  gameId: { type: String, required: true }, // 'inhouse-crash', 'inhouse-roulette'
  gameTitle: { type: String, required: true },

  // Çok-kiracılı provider mimarisi (bkz. server/src/provider/): null =
  // eski/tek-operatör davranışı (11 oyunun 11'i de bu turda hâlâ null,
  // dokunulmadı). Gerçek bir ObjectId = operatöre özel ayar (şu an sadece
  // Crash için, bkz. scripts/migrations/add-operator-to-game-settings.mjs).
  // İKİ ayrı partial unique index aşağıda: biri null-operatorId grubu için
  // eski tekil-gameId davranışını korur, diğeri gerçek operatorId'ler için
  // (operatorId,gameId) ikilisini tekilleştirir — böylece 11 eski oyun hiç
  // etkilenmeden aynı koleksiyonda operatör-bazlı Crash dokümanları yaşayabilir.
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', default: null, index: true },
  
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

  // Plinko settings — payoutScale, gerçek çarpan tablosuna (routes/inhouse.js
  // PLINKO_MULT) doğrudan uygulanan çarpan (mult = tabloDeğeri × scale)
  plinkoPayoutScale: { type: Number, default: 1.0, min: 0.5, max: 1.3 },
  plinkoMinBet: { type: Number, default: 1, min: 0.01 },
  plinkoMaxBet: { type: Number, default: 50000, min: 1 },

  // Wheel settings — payoutScale, WHEEL_SEGMENTS'teki m değerlerine uygulanır
  wheelPayoutScale: { type: Number, default: 1.0, min: 0.5, max: 1.3 },
  wheelMinBet: { type: Number, default: 1, min: 0.01 },
  wheelMaxBet: { type: Number, default: 50000, min: 1 },

  // Keno settings — payoutScale, KENO_PAYOUTS tablosuna uygulanır
  kenoPayoutScale: { type: Number, default: 1.0, min: 0.5, max: 1.3 },
  kenoMinBet: { type: Number, default: 1, min: 0.01 },
  kenoMaxBet: { type: Number, default: 50000, min: 1 },

  // Baccarat settings — 3 bağımsız ödeme çarpanı, mekanik sabit (oyuncu kararı yok)
  baccaratBankerMultiplier: { type: Number, default: 1.7, min: 1.5, max: 2.0 },
  baccaratPlayerMultiplier: { type: Number, default: 1.75, min: 1.5, max: 2.0 },
  baccaratTieMultiplier: { type: Number, default: 8, min: 4, max: 15 },
  baccaratMinBet: { type: Number, default: 1, min: 0.01 },
  baccaratMaxBet: { type: Number, default: 50000, min: 1 },

  // Blackjack settings — RTP oyuncu kararına bağlı (Monte Carlo tahmini)
  blackjackPayoutMult: { type: Number, default: 2.0, min: 1.5, max: 2.5 }, // "blackjack" eli
  blackjackWinMult: { type: Number, default: 1.4, min: 1.0, max: 2.0 }, // normal kazanç
  dealerHitsSoft17: { type: Boolean, default: true }, // mevcut canlı davranış
  blackjackMinBet: { type: Number, default: 1, min: 0.01 },
  blackjackMaxBet: { type: Number, default: 50000, min: 1 },

  // Video Poker (Jacks or Better) settings — el tipi başına ödeme çarpanı,
  // RTP oyuncunun tutma kararına bağlı (Monte Carlo tahmini)
  vpRoyalFlushMult: { type: Number, default: 656, min: 100, max: 1000 },
  vpStraightFlushMult: { type: Number, default: 41, min: 10, max: 100 },
  vpFourKindMult: { type: Number, default: 21, min: 5, max: 50 },
  vpFullHouseMult: { type: Number, default: 7, min: 1, max: 15 },
  vpFlushMult: { type: Number, default: 5, min: 1, max: 15 },
  vpStraightMult: { type: Number, default: 3, min: 1, max: 10 },
  vpThreeKindMult: { type: Number, default: 2.5, min: 0.5, max: 5 },
  vpTwoPairMult: { type: Number, default: 1.5, min: 0.5, max: 5 },
  vpJacksOrBetterMult: { type: Number, default: 0.8, min: 0.5, max: 3 },
  vpMinBet: { type: Number, default: 1, min: 0.01 },
  vpMaxBet: { type: Number, default: 50000, min: 1 },

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

// Açık isimler bilerek verildi: eski (tek alanlı, partial OLMAYAN) `gameId_1`
// unique index'iyle aynı ada düşüp MongoDB'de "IndexOptionsConflict" hatası
// almamak için — migration (scripts/migrations/add-operator-to-game-settings.mjs)
// eski index'i açıkça DÜŞÜRÜR, bu ikisi onun yerine geçer.
schema.index({ gameId: 1 }, { name: 'gameId_legacy_unique', unique: true, partialFilterExpression: { operatorId: null } });
schema.index({ operatorId: 1, gameId: 1 }, { name: 'operatorId_gameId_unique', unique: true, partialFilterExpression: { operatorId: { $type: 'objectId' } } });

export default mongoose.model('GameSettings', schema);