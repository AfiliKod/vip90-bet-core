import mongoose from 'mongoose';
import { getTenancyMode } from '../config/tenancy.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

/**
 * Runtime settings editable from the admin panel. Rows are scoped (spec §4.5):
 * platform (tenantId null), tenant, or brand.
 */
const settingSchema = new mongoose.Schema({
  scope:    { type: String, enum: ['platform', 'tenant', 'brand'], default: 'tenant', index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  brandId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  // Mode is fixed at boot: single keeps the legacy global key_1 unique, multi never creates it.
  key:      { type: String, required: true, unique: getTenancyMode() !== 'multi', index: true },
  // Mixed so platform defaults (e.g. N1 bootstrap flags) can hold native booleans/numbers;
  // every existing store still writes strings explicitly.
  value:    { type: mongoose.Schema.Types.Mixed, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

registerTenantIndexes('Setting', [
  { keys: { tenantId: 1, scope: 1, brandId: 1, key: 1 }, options: { name: 'tenant_setting_scope_brand_key_uniq', unique: true } },
]);

export default mongoose.model('Setting', settingSchema);
