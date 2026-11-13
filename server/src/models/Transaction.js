import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, enum: ['deposit','withdraw','bet','win','bonus','refund','admin_adjustment','crypto_deposit','crypto_withdraw','casino_return','bonus_conversion','referral_commission','bonus_forfeit','agent_transfer_in','agent_transfer_out','agent_commission','tip_sent','tip_received','rain','cashback','reversal','chargeback','deposit_refund','casino_bet','casino_win','casino_cancel','casino_transfer'], required: true },
  amount:        { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  referenceId:     mongoose.Schema.Types.ObjectId,
  cryptoDepositId: { type: mongoose.Schema.Types.ObjectId, ref: 'CryptoDeposit', default: null },
  status:        { type: String, enum: ['pending','processing','completed','failed','rejected'], default: 'completed' },
  note:          { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // ─── Financial Ledger Enhancement (Phase 2A) ──────────────────────
  idempotencyKey: { type: String, unique: true, sparse: true },
  currency:       { type: String, required: true, default: 'TRY' },
  source:         { type: String, enum: ['system', 'admin', 'provider', 'player'], default: 'system' },
  metadata:       { type: mongoose.Schema.Types.Mixed, default: {} },
  relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  walletId:       { type: String, default: 'main' },
  isSeed:         { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, type: 1, createdAt: -1 });
schema.index({ type: 1, status: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
// Financial Ledger indexes
schema.index({ relatedTransactionId: 1 });
schema.index({ currency: 1, createdAt: -1 });

registerTenantIndexes('Transaction', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, userId: 1, type: 1, createdAt: -1 }, options: { name: 'tenant_userId_type_createdAt' } },
  { keys: { tenantId: 1, type: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_type_status_createdAt' } },
  { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
  { keys: { tenantId: 1, currency: 1, createdAt: -1 }, options: { name: 'tenant_currency_createdAt' } },
]);

export default defineTenantModel('Transaction', schema);
