import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  category: { type: String, enum: ['company', 'legal'], required: true },
  route: { type: String, required: true }, // '/about', '/legal/terms' — public route, admin'de değiştirilmez
  title: { type: String, required: true },
  intro: { type: String, default: '' },
  sections: [{
    title: { type: String, required: true },
    content: { type: [String], default: [] },
  }],
  isEnabled: { type: Boolean, default: true },
  footerColumn: { type: String, enum: ['brand', 'support', 'legal'], required: true },
  footerOrder: { type: Number, default: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ footerColumn: 1, footerOrder: 1 });

registerTenantIndexes('StaticPage', [
  { keys: { tenantId: 1, brandId: 1, slug: 1 }, options: { unique: true, name: 'tenant_brandId_slug_uniq' } },
]);

export default defineTenantModel('StaticPage', schema);
