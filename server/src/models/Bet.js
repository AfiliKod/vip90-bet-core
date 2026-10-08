import mongoose from 'mongoose';

const selectionSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  marketType: String, oddId: String, oddLabel: String, oddValue: Number,
  eventLabel: String,
  outcome: { type: String, enum: ['pending','won','lost'], default: 'pending' },
}, { _id: false });

const schema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  selections:   { type: [selectionSchema], required: true },
  type:         { type: String, enum: ['single','combo'], required: true },
  stake:        { type: Number, required: true, min: 1 },
  totalOdds:    { type: Number, required: true },
  potentialWin: { type: Number, required: true },
  status:       { type: String, enum: ['pending','won','lost','cancelled'], default: 'pending' },
  settledAt:    Date,
  isSeed:       { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1, createdAt: -1 });
schema.index({ status: 1 });
schema.index({ createdAt: -1 });

schema.post('save', async function() {
  try {
    const { logActivity } = await import('../services/activityFeed.js');
    if (this.wasNew) {
      await logActivity({
        type: 'bet_placed', userId: this.userId, status: this.status,
        // summary artık salt-okunur değil — client ActivityFeed.jsx bu ham
        // Türkçe metni değil, type+data'dan i18n ile ürettiği kendi metnini
        // gösteriyor (bkz. renderSummary). data.selectionCount o yüzden burada.
        summary: `Bahis: ${this.stake}₺, ${this.selections.length} seçim`,
        amount: this.stake, data: { selectionCount: this.selections.length },
        referenceId: this._id, referenceModel: 'Bet',
      });
    } else if (this._statusModified && ['won', 'lost', 'cancelled'].includes(this.status)) {
      await logActivity({
        type: 'bet_settled', userId: this.userId, status: this.status,
        summary: `Bahis sonuçlandı: ${this.status}`,
        amount: this.status === 'won' ? this.potentialWin : this.stake,
        referenceId: this._id, referenceModel: 'Bet',
      });
      // Kazanma/kaybetme bildirimi — settle döngüsünü ASLA bekletmez (floating
      // promise). Panelde şablon yoksa sendActionMail ilk sorguda atlar.
      if (!this.isSeed) {
        import('../services/systemMail.js')
          .then(({ sendActionMail }) => sendActionMail('bet.settled', {
            userId: this.userId,
            vars: {
              betId: String(this._id),
              betStatus: this.status,
              isWon: this.status === 'won',
              isLost: this.status === 'lost',
              isCancelled: this.status === 'cancelled',
              stake: this.stake,
              potentialWin: this.potentialWin,
              totalOdds: this.totalOdds,
              payout: this.status === 'won' ? this.potentialWin : 0,
              selectionCount: Array.isArray(this.selections) ? this.selections.length : 0,
              settledAt: (this.settledAt || new Date()).toISOString(),
            },
          }))
          .catch(() => {});
        // SMS — kazanma/kaybetme ayrı olaylardır (iptal olayı yok). Alıcı
        // `userId` ile çözülür; fire-and-forget, kapılar kapalıysa atlar.
        if (this.status === 'won' || this.status === 'lost') {
          const first = Array.isArray(this.selections) ? (this.selections[0] || {}) : {};
          const smsEvent = this.status === 'won' ? 'betWon' : 'betLost';
          const smsVars = {
            betId: String(this._id),
            amount: this.status === 'won' ? this.potentialWin : this.stake,
            stake: this.stake,
            market: first.oddLabel || first.eventLabel || first.marketType || '',
            odds: this.totalOdds,
          };
          const betUserId = this.userId;
          import('../services/smsTemplate.js')
            .then(({ dispatchSmsEvent }) => dispatchSmsEvent(smsEvent, null, smsVars, { userId: betUserId }))
            .catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[activity] Bet post-save error:', e.message);
  }
});

// wasNew — post('save') içinde this.isNew her zaman false olur (save tamamlandıktan
// sonra tetiklenir), bu yüzden pre('save')'de yakalanan orijinal isNew değeri kullanılır.
// Mongoose 8'de post('save')'de isModified da false döner; status değişimi pre'de yakalanır.
schema.pre('save', function(next) {
  this.wasNew = this.isNew;
  this._statusModified = this.isModified('status');
  next();
});

export default mongoose.model('Bet', schema);
