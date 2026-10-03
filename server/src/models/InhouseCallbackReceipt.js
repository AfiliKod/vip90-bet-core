import mongoose from 'mongoose';

/**
 * Operatör tarafında (bu site) merkezi provider'dan gelen wallet-callback'lerin
 * kalıcı idempotency kaydı. Igames entegrasyonundaki `processedCallbacks`
 * in-memory Map'in (routes/igames.js, TTL 5dk, process-local, restart'ta
 * sıfırlanır) zayıflığını gidermek için kalıcı: aynı txnId ikinci kez
 * gelirse (retry worker'ın tekrar denemesi) unique index atomik olarak
 * reddeder, önceki yanıt tekrar döndürülür.
 */
const schema = new mongoose.Schema({
  txnId: { type: String, required: true, unique: true },
  direction: { type: String, enum: ['debit', 'settle'], required: true },
  operatorGameId: { type: String, required: true }, // provider'daki gameId ('crash')
  externalPlayerId: { type: String, required: true },
  approved: { type: Boolean, required: true },
  responsePayload: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

export default mongoose.model('InhouseCallbackReceipt', schema);
