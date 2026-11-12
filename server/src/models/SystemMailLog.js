import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

/**
 * Sistem e-postası gönderim kaydı — hem aksiyon tetikli hem panelden
 * yapılan gönderimlerin izi. Panelde "Gönderim geçmişi" olarak listelenir.
 *
 * Toplu gönderimlerde alıcı başına tek satır yazılır; `batchId` aynı
 * panelden tetiklenen gönderimi gruplar.
 */
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemMailTemplate', default: null, index: true },
  event: { type: String, default: '', index: true },
  category: { type: String, enum: ['action', 'scheduled'], default: 'action', index: true },
  // action   → sistem olayı tetikledi
  // manual   → admin panelinden gönderildi
  // schedule → zamanlanmış iş gönderdi
  trigger: { type: String, enum: ['action', 'manual', 'schedule'], required: true, index: true },
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  batchId: { type: String, default: null, index: true },
  audienceType: { type: String, enum: ['all', 'segments', 'users', 'inactive', 'direct'], default: 'direct' },
  to: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  subject: { type: String, default: '' },
  status: { type: String, enum: ['sent', 'mock', 'failed', 'skipped'], default: 'sent', index: true },
  error: { type: String, default: '' },
  sentAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

schema.index({ sentAt: -1 });
schema.index({ category: 1, sentAt: -1 });

registerTenantIndexes('SystemMailLog', [
  { keys: { tenantId: 1, sentAt: -1 }, options: { name: 'tenant_sentAt' } },
  { keys: { tenantId: 1, trigger: 1, sentAt: -1 }, options: { name: 'tenant_trigger_sentAt' } },
]);

export default defineTenantModel('SystemMailLog', schema);
