import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const CasinoRoundSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameId:        { type: String, required: true, index: true },
  gameTitle:     { type: String, default: '' },
  provider:      { type: String, default: '' },  // 'oddsSource' | 'igames' | 'inhouse'
  bet:           { type: Number, required: true },
  payout:        { type: Number, default: 0 },
  net:           { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  currency:      { type: String, default: 'TRY', uppercase: true, trim: true },
  palaceUserCode: { type: String, default: null, index: true },
  note:          { type: String, default: '' },  // 'bet_cancel' | 'bonus_call:<id>'
  isSeed:        { type: Boolean, default: false, index: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

CasinoRoundSchema.index({ userId: 1, createdAt: -1 });
CasinoRoundSchema.index({ gameId: 1, createdAt: -1 });
CasinoRoundSchema.index({ createdAt: -1 });

registerTenantIndexes('CasinoRound', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, gameId: 1, createdAt: -1 }, options: { name: 'tenant_gameId_createdAt' } },
  { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
  { keys: { tenantId: 1, palaceUserCode: 1 }, options: { name: 'tenant_palaceUserCode', sparse: true } },
]);

/**
 * Side effects of a saved casino round: bonus wagering credit, VIP XP, and for
 * inhouse rounds referral commission, VIP cashback and the admin activity feed.
 * Each step is best-effort (errors are logged, never thrown).
 *
 * The post-save hook runs this only for rounds saved WITHOUT a session. A
 * writer that saves rounds inside a transaction must call this itself after
 * the transaction commits (V19a): side effects inside the transaction would
 * either join it (and be retried with it) or run outside it and survive an
 * abort.
 *
 * Contract for such a caller (igames, V18): call it EXACTLY ONCE per committed
 * round, after commit, never inside the transaction body (withTransactionRetry
 * may run the body several times) and never for a round whose transaction
 * aborted. Calling it twice credits wagering, XP, commission and cashback
 * twice; nothing here deduplicates.
 */
export async function applyCasinoRoundSideEffects(round) {
  if (!round.bet || round.bet <= 0) return;
  if (round.provider !== 'igames' && round.provider !== 'inhouse') return;
  await casinoRoundSideEffects.call(round);
}

async function casinoRoundSideEffects() {
  try {
    const { recordWagering } = await import('../services/wagering.js');
    const gameType = this.provider === 'igames' ? 'casino_slot' : 'inhouse';
    await recordWagering(this.userId, gameType, this.bet);
  } catch (e) {
    console.error('[wagering] CasinoRound post-save error:', e.message);
  }
  // O1 — VIP/seviye programı: her casino turunda XP kazanılır (services/vip.js
  // zaten yazılmıştı, hiçbir yerden çağrılmıyordu — bkz. XP_RATES.casino).
  try {
    const { awardXp } = await import('../services/vip.js');
    await awardXp(this.userId, this.bet, 'casino');
  } catch (e) {
    console.error('[vip] CasinoRound post-save error:', e.message);
  }
  // Igames bir spin'i iki ayrı round'a (bahis/kazanç) böldüğü için per-round komisyon
  // brüt ciro üzerinden öderdi — Igames komisyonu closeIgamesSession'da (Task 4b) net GGR
  // üzerinden ödeniyor. inhouse tek birleşik round yazdığı için per-round burada doğru.
  if (this.provider === 'inhouse') {
    try {
      const { payReferralCommission } = await import('../services/referralCommission.js');
      await payReferralCommission(this.userId, -this.net, { sourceId: this._id });
    } catch (e) {
      console.error('[referral] CasinoRound post-save error:', e.message);
    }
    // VIP cashback — inhouse turlarında stake üzerinden cashback
    try {
      const { payCashback } = await import('../services/vip.js');
      await payCashback(this.userId, this.bet, { sourceId: this._id });
    } catch (e) {
      console.error('[vip] CasinoRound cashback error:', e.message);
    }
  }
  // Admin canlı aktivite akışı — yalnızca inhouse (kendi oyun motorumuz).
  // Igames kapsam dışı (bkz. docs/superpowers/specs/2026-09-22-admin-activity-feed-design.md § Kapsam dışı).
  if (this.provider === 'inhouse') {
    try {
      const { upsertGameSession } = await import('../services/activityFeed.js');
      await upsertGameSession({
        userId: this.userId, gameId: this.gameId, gameTitle: this.gameTitle || this.gameId,
        bet: this.bet, net: this.net,
      });
    } catch (e) {
      console.error('[activity] CasinoRound post-save error:', e.message);
    }
  }
}

// Bet oluşturulduğunda otomatik wagering credit. The hook skips on ANY session
// ($session() set), not only inside a transaction: a writer that passes a
// session without a transaction must also call applyCasinoRoundSideEffects
// itself. The transactional writer calls it after commit.
CasinoRoundSchema.post('save', async function() {
  if (this.$session()) return;
  return applyCasinoRoundSideEffects(this);
});

export default defineTenantModel('CasinoRound', CasinoRoundSchema);
