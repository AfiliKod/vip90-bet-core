import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

/**
 * Operatör tarafında (bu site) merkezi provider'dan gelen wallet-callback'lerin
 * kalıcı idempotency kaydı. Igames entegrasyonundaki `processedCallbacks`
 * in-memory Map'in (routes/igames.js, TTL 5dk, process-local, restart'ta
 * sıfırlanır) zayıflığını gidermek için kalıcı: aynı txnId ikinci kez
 * gelirse (retry worker'ın tekrar denemesi) unique index atomik olarak
 * reddeder, önceki yanıt tekrar döndürülür.
 */
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  txnId: { type: String, required: true, unique: true },
  direction: { type: String, enum: ['debit', 'settle'], required: true },
  operatorGameId: { type: String, required: true }, // provider'daki gameId ('crash')
  externalPlayerId: { type: String, required: true },
  approved: { type: Boolean, required: true },
  responsePayload: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

registerTenantIndexes('InhouseCallbackReceipt', [
  { keys: { tenantId: 1, operatorGameId: 1, createdAt: -1 }, options: { name: 'tenant_operatorGameId_createdAt' } },
]);

export default defineTenantModel('InhouseCallbackReceipt', schema);
