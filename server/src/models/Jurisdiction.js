import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  
  // Configuration
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  // Regulatory requirements
  requirements: {
    // Age verification
    minimumAge: { type: Number, default: 18 },
    
    // KYC requirements
    kycRequired: { type: Boolean, default: false },
    kycLevel1Required: { type: Boolean, default: false },
    kycLevel2Required: { type: Boolean, default: false },
    
    // Responsible gaming
    depositLimitRequired: { type: Boolean, default: false },
    sessionLimitRequired: { type: Boolean, default: false },
    selfExclusionRequired: { type: Boolean, default: false },
    
    // Content restrictions
    allowedGameTypes: [{ type: String }], // ['casino', 'sports', 'poker', etc.]
    restrictedGameTypes: [{ type: String }],
    
    // Payment restrictions
    allowedPaymentMethods: [{ type: String }],
    restrictedPaymentMethods: [{ type: String }],
    
    // Currency restrictions
    allowedCurrencies: [{ type: String }],
    defaultCurrency: { type: String, default: 'TRY' },
  },
  
  // Compliance rules
  compliance: {
    // Data retention
    dataRetentionDays: { type: Number, default: 365 },
    
    // Audit requirements
    auditLogRetentionDays: { type: Number, default: 365 },
    
    // Reporting requirements
    reportingRequired: { type: Boolean, default: false },
    reportingFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'monthly' },
    
    // Tax requirements
    taxOnWinnings: { type: Boolean, default: false },
    taxRate: { type: Number, default: 0 },
    
    // Advertising restrictions
    advertisingRestricted: { type: Boolean, default: false },
    bonusAdvertisingRestricted: { type: Boolean, default: false },
  },
  
  // Technical requirements
  technical: {
    // geolocation required
    geolocationRequired: { type: Boolean, default: false },
    
    // VPN detection
    vpnDetectionRequired: { type: Boolean, default: false },
    
    // IP blocking
    ipBlockingRequired: { type: Boolean, default: false },
    
    // Time zone
    timezone: { type: String, default: 'UTC' },
  },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Indexes
schema.index({ code: 1 });
schema.index({ isActive: 1 });
schema.index({ isDefault: 1 });

export default mongoose.model('Jurisdiction', schema);
