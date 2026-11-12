import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const CasinoSessionSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  palaceUserCode: { type: String, required: true, index: true },
  gameId:        { type: String, required: true },
  gameTitle:     { type: String, default: '' },
  initialBalance: { type: Number, required: true },
  currency:      { type: String, default: 'TRY', uppercase: true, trim: true },
  transferredAt: { type: Date, required: true },
  // F3: 'provider' = the session's money sits at the provider until the close;
  // callbacks only record rounds (walletId 'igames' ledger rows) and the close
  // credits balance + withdrawnAmount. Sessions opened before F3 have no value
  // (legacy: callbacks move the local balance, the close credits
  // max(balance, withdrawnAmount)). No default, so legacy rows stay legacy.
  balanceModel:  { type: String, enum: ['provider'], default: undefined },
  // F3: set when the provider confirmed the launch deposit. A 'provider'
  // session with depositedAt null is decided by reconcile from the provider
  // balance (deposited / refunded / flagged).
  depositedAt:   { type: Date, default: null },
  // Provider balance read just before the launch deposit (leftover late
  // rounds). An ambiguous deposit is decided against it; null (the read
  // failed) → never inferred, flagged.
  providerBalanceBeforeDeposit: { type: Number, default: null },
  // F3: the provider definitely refused the launch deposit (set before the
  // refund, so reconcile finishes a failed refund without a provider read).
  depositRefusedAt: { type: Date, default: null },
  // First provider read of an unconfirmed deposit; a second equal read at
  // least 30 s later decides it, a different read restarts.
  depositCheckBalance: { type: Number, default: null },
  depositCheckAt: { type: Date, default: null },
  // A refunded launch's late deposit was withdrawn back from the provider.
  strayDepositRecoveredAt: { type: Date, default: null },
  // 'closing' (V19b): the close has started; the provider withdraw and the
  // credit are finished by a resumed close or reconcileStuckSessions. A
  // closing session still counts as open (no new launch until it is closed).
  status:        { type: String, enum: ['active', 'closing', 'closed', 'reconciled'], default: 'active', index: true },
  // Set at active → closing (when the player left; it bounds the referral /
  // cashback round window), not when the close is credited.
  closedAt:      { type: Date, default: null },
  finalBalance:  { type: Number, default: null },
  withdrawnAmount: { type: Number, default: null },
  providerBalance: { type: Number, default: null }, // provider balance reported by withdraw-all
  withdrawnAt:   { type: Date, default: null },     // set once withdraw-all succeeded; never called again after
  withdrawClaimedAt: { type: Date, default: null }, // lease so concurrent closes call withdraw-all once
  withdrawUncertainAt: { type: Date, default: null }, // last withdraw-all with an unknown outcome (timeout, 5xx, bad body)
  withdrawAttempts: { type: Number, default: 0 },
  // Set when the close cannot safely finish on its own (provider balance 0
  // after an uncertain withdraw, a withdraw far below expectedAmount, or
  // overlapping calls that disagree). Never closed automatically; an admin
  // resolves it. expectedAmount = initialBalance + Σ CasinoRound.net.
  needsReconciliation: { type: Boolean, default: false },
  expectedAmount: { type: Number, default: null },
  // Why it was flagged when it is not the close (F3: 'deposit_uncertain',
  // 'stray_deposit', 'possible_stray_deposit').
  reconciliationReason: { type: String, default: null },
  // Staff resolution of a flagged session (POST /api/igames/session/:id/resolve).
  resolvedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt:    { type: Date, default: null },
  resolutionNote: { type: String, default: null },
  closeReason:   { type: String, default: null }, // 'user' | 'timeout' | 'replaced'
  netResult:     { type: Number, default: null }, // CasinoRound.net toplamı (transferredAt..closedAt) — ileride bildirim için
  // Review notes that do not block the close (F3: withdrawnAboveExpected =
  // { withdrawnAmount, expectedAmount, at } when withdraw-all returned more
  // than expected).
  metadata:      { type: mongoose.Schema.Types.Mixed, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: true } });

CasinoSessionSchema.index({ userId: 1, status: 1 });
CasinoSessionSchema.index({ status: 1, transferredAt: 1 });

registerTenantIndexes('CasinoSession', [
  { keys: { tenantId: 1, userId: 1, status: 1 }, options: { name: 'tenant_userId_status' } },
  { keys: { tenantId: 1, palaceUserCode: 1 }, options: { name: 'tenant_palaceUserCode' } },
  { keys: { tenantId: 1, status: 1, transferredAt: 1 }, options: { name: 'tenant_status_transferredAt' } },
]);

// ─── Oturum kapanışında kar/zarar bildirimi ────────────────────────────────
// Kapanış farklı alt paketlerden (igames, inhouse) tetiklendiği için kancayı
// MODELDE tutuyoruz — hangi paket kapattığı fark etmez, tek yerden yakalanır.
// Fire-and-forget: kapanış yolunu e-posta SMTP'sine bağlamıyoruz.
CasinoSessionSchema.pre('save', function(next) {
  this._statusModified = this.isModified('status');
  next();
});

CasinoSessionSchema.post('save', async function() {
  if (!this._statusModified || this.status !== 'closed' || this.netResult == null) return;
  try {
    const { sendActionMail } = await import('../services/systemMail.js');
    const start = this.transferredAt instanceof Date ? this.transferredAt.getTime() : Date.now();
    const end = this.closedAt instanceof Date ? this.closedAt.getTime() : Date.now();
    sendActionMail('casino.sessionClosed', {
      userId: this.userId,
      vars: {
        gameTitle: this.gameTitle || this.gameId || '',
        netResult: this.netResult,
        isProfit: this.netResult > 0,
        isLoss: this.netResult < 0,
        isEven: this.netResult === 0,
        initialBalance: this.initialBalance,
        finalBalance: this.finalBalance ?? this.initialBalance,
        durationMinutes: Math.max(0, Math.round((end - start) / 60000)),
        closedAt: (this.closedAt || new Date()).toISOString(),
      },
    }).catch(() => {});
    // SMS — kâr/zarar ayrı olaylardır (berabere olayı yok). Fire-and-forget;
    // alıcı `userId` ile çözülür, şablon/gateway/modül kapalıysa atlar.
    if (this.netResult > 0 || this.netResult < 0) {
      const smsEvent = this.netResult > 0 ? 'casinoSessionProfit' : 'casinoSessionLoss';
      const smsVars = {
        netProfit: this.netResult > 0 ? this.netResult : 0,
        netLoss: this.netResult < 0 ? Math.abs(this.netResult) : 0,
        // SMS katalog değişkeni birim belirtmez; demo metinler kullanmıyor,
        // operatör şablonu yazarken "dk" gibi birimi kendisi ekler.
        duration: Math.max(0, Math.round((end - start) / 60000)),
        games: this.gameTitle || this.gameId || '',
      };
      const sessionUserId = this.userId;
      import('../services/smsTemplate.js')
        .then(({ dispatchSmsEvent }) => dispatchSmsEvent(smsEvent, null, smsVars, { userId: sessionUserId }))
        .catch(() => {});
    }
  } catch (e) {
    console.error('[CasinoSession] bildirim maili başlatılamadı:', e.message);
  }
});

export default defineTenantModel('CasinoSession', CasinoSessionSchema);
