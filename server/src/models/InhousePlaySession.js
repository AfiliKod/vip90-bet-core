import mongoose from 'mongoose';

/**
 * In-house oyun oturumu (2026-10-08).
 *
 * Neden yeni bir koleksiyon: oturum süresi tavanı **sunucu tarafında** zorlanmalı
 * ve denetlenebilir olmalı. `ActivityEvent.game_session` dokümanları 10 dakikalık
 * boşlukla kendiliğinden emilir (bkz. services/activityFeed.js) ve admin akışı
 * içindir; uyum denetimi için kullanılamaz. `User.responsibleLimits.sessionTimeoutMin`
 * ise yazılıyor ama HİÇ OKUNMUYORDU (gap: oyuncunun kendi koyduğu limit sessizce
 * uygulanmıyordu).
 *
 * Alanlar:
 *  - startedAt      oturumun ilk açılışı (tavan buradan ölçülür)
 *  - lastActivityAt son tur (raporlama için)
 *  - rounds/totalBet tur sayısı ve toplam bahis (denetim raporu girdisi)
 *  - status         active | closed
 *  - closeReason    max_duration | player_closed | closed_by_limit
 */
const schema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameId:        { type: String, required: true },
  status:        { type: String, enum: ['active', 'closed'], default: 'active', index: true },
  startedAt:     { type: Date, default: Date.now },
  lastActivityAt:{ type: Date, default: Date.now },
  closedAt:      { type: Date, default: null },
  closeReason:   { type: String, default: null },
  rounds:        { type: Number, default: 0, min: 0 },
  totalBet:      { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

schema.index({ userId: 1, status: 1, startedAt: -1 });
schema.index({ createdAt: -1 });

export default mongoose.models.InhousePlaySession || mongoose.model('InhousePlaySession', schema);