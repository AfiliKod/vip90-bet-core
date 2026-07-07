import mongoose from 'mongoose';

const CasinoRoundSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameId:        { type: String, required: true, index: true },
  gameTitle:     { type: String, default: '' },
  provider:      { type: String, default: '' },  // 'oddsSource' | 'palace' | 'inhouse'
  bet:           { type: Number, required: true },
  payout:        { type: Number, default: 0 },
  net:           { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  palaceUserCode: { type: String, default: null, index: true },
  note:          { type: String, default: '' },  // 'bet_cancel' | 'bonus_call:<id>'
}, { timestamps: { createdAt: true, updatedAt: false } });

CasinoRoundSchema.index({ userId: 1, createdAt: -1 });
CasinoRoundSchema.index({ gameId: 1, createdAt: -1 });
CasinoRoundSchema.index({ createdAt: -1 });

// Bet oluşturulduğunda otomatik wagering credit
CasinoRoundSchema.post('save', async function() {
  if (!this.bet || this.bet <= 0) return;
  if (this.provider !== 'palace' && this.provider !== 'inhouse') return;
  try {
    const { recordWagering } = await import('../services/wagering.js');
    const gameType = this.provider === 'palace' ? 'casino_slot' : 'inhouse';
    await recordWagering(this.userId, gameType, this.bet);
  } catch (e) {
    console.error('[wagering] CasinoRound post-save error:', e.message);
  }
  try {
    const { payReferralCommission } = await import('../services/referralCommission.js');
    await payReferralCommission(this.userId, -this.net);
  } catch (e) {
    console.error('[referral] CasinoRound post-save error:', e.message);
  }
});

export default mongoose.model('CasinoRound', CasinoRoundSchema);