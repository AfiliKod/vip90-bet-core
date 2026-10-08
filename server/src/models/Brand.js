import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  
  // Branding
  logo: { type: String, default: null },
  favicon: { type: String, default: null },
  primaryColor: { type: String, default: '#7c3aed' },
  secondaryColor: { type: String, default: '#1a2332' },
  
  // Domain configuration
  domains: [{
    domain: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
  }],
  
  // Configuration
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  // Allowed currencies for this brand
  currencies: [{ type: String }],
  
  // Allowed modules for this brand
  modules: [{
    name: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
  }],
  
  // Theme overrides
  theme: {
    primaryColor: { type: String, default: null },
    secondaryColor: { type: String, default: null },
    fontFamily: { type: String, default: null },
    borderRadius: { type: String, default: null },
  },
  
  // Contact information
  contact: {
    email: { type: String, default: null },
    phone: { type: String, default: null },
    address: { type: String, default: null },
  },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Indexes
schema.index({ isActive: 1 });
schema.index({ isDefault: 1 });
schema.index({ 'domains.domain': 1 });

export default mongoose.model('Brand', schema);
