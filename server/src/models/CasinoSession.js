import mongoose from 'mongoose';

const CasinoSessionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  palaceUserCode: { type: String, required: true, index: true },
  gameId:        { type: String, required: true },
  gameTitle:     { type: String, default: '' },
  initialBalance: { type: Number, required: true },
  transferredAt: { type: Date, required: true },
  status:        { type: String, enum: ['active', 'closed', 'reconciled'], default: 'active', index: true },
  closedAt:      { type: Date, default: null },
  finalBalance:  { type: Number, default: null },
  withdrawnAmount: { type: Number, default: null },
  closeReason:   { type: String, default: null }, // 'user' | 'timeout' | 'replaced'
  netResult:     { type: Number, default: null }, // CasinoRound.net toplamı (transferredAt..closedAt) — ileride bildirim için
}, { timestamps: { createdAt: true, updatedAt: true } });

CasinoSessionSchema.index({ userId: 1, status: 1 });
CasinoSessionSchema.index({ status: 1, transferredAt: 1 });

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

export default mongoose.model('CasinoSession', CasinoSessionSchema);