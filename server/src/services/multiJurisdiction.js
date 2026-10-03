import mongoose from 'mongoose';
import escapeStringRegexp from 'escape-string-regexp';
import Jurisdiction from '../models/Jurisdiction.js';

/**
 * Multi-Jurisdiction Service
 * Supports jurisdiction-specific rules and compliance requirements
 */

// In-memory cache for active jurisdictions
let activeJurisdictions = null;
let lastLoaded = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Load active jurisdictions from database
 */
async function loadActiveJurisdictions() {
  const now = Date.now();
  if (activeJurisdictions && now - lastLoaded < CACHE_TTL) {
    return activeJurisdictions;
  }
  
  try {
    activeJurisdictions = await Jurisdiction.find({ isActive: true }).lean();
    lastLoaded = now;
  } catch (error) {
    // Fallback to default jurisdiction if DB fails
    activeJurisdictions = [{
      code: 'DEFAULT',
      name: 'Default Jurisdiction',
      isActive: true,
      isDefault: true,
      requirements: {
        minimumAge: 18,
        kycRequired: false,
      },
    }];
  }
  
  return activeJurisdictions;
}

/**
 * Get all jurisdictions
 */
export async function getAllJurisdictions(options = {}) {
  const { page = 1, limit = 50, isActive = null } = options;
  const search = options.search || '';
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = {};
  if (isActive !== null) filter.isActive = isActive;
  // Kullanıcı araması: client `search` gönderiyordu ama servis desteklemiyordu
  // (arama yalnız mevcut sayfayı süzerdi). ReDoS'a karşı desen kaçırılır.
  if (search) {
    const re = new RegExp(escapeStringRegexp(String(search).trim()), 'i');
    filter.$or = [ { code: re }, { name: re } ];
  }
  
  const [jurisdictions, total] = await Promise.all([
    Jurisdiction.find(filter)
      .sort({ isDefault: -1, name: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username'),
    Jurisdiction.countDocuments(filter),
  ]);
  
  return {
    jurisdictions,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Get jurisdiction by ID
 */
export async function getJurisdictionById(id) {
  return Jurisdiction.findById(id)
    .populate('createdBy', 'username')
    .populate('updatedBy', 'username');
}

/**
 * Get jurisdiction by code
 */
export async function getJurisdictionByCode(code) {
  return Jurisdiction.findOne({ code: code.toUpperCase() })
    .populate('createdBy', 'username')
    .populate('updatedBy', 'username');
}

/**
 * Get default jurisdiction
 */
export async function getDefaultJurisdiction() {
  return Jurisdiction.findOne({ isDefault: true });
}

/**
 * Get active jurisdictions (cached)
 */
export async function getActiveJurisdictions() {
  return loadActiveJurisdictions();
}

/**
 * Create a new jurisdiction
 */
export async function createJurisdiction(data, options = {}) {
  const { session = null } = options;
  
  // Check if jurisdiction code already exists
  const existing = await Jurisdiction.findOne({ code: data.code.toUpperCase() });
  if (existing) {
    throw new Error(`Jurisdiction ${data.code} already exists`);
  }
  
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await Jurisdiction.updateMany({ isDefault: true }, { isDefault: false }, { session });
  }
  
  const jurisdiction = await Jurisdiction.create([{
    ...data,
    code: data.code.toUpperCase(),
  }], { session });
  
  // Invalidate cache
  activeJurisdictions = null;
  
  return jurisdiction[0];
}

/**
 * Update jurisdiction
 */
export async function updateJurisdiction(id, data, options = {}) {
  const { session = null } = options;
  
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await Jurisdiction.updateMany(
      { isDefault: true, _id: { $ne: id } },
      { isDefault: false },
      { session }
    );
  }
  
  const jurisdiction = await Jurisdiction.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, session }
  );
  
  // Invalidate cache
  activeJurisdictions = null;
  
  return jurisdiction;
}

/**
 * Delete jurisdiction
 */
export async function deleteJurisdiction(id, options = {}) {
  const { session = null } = options;
  
  // Don't allow deleting default jurisdiction
  const jurisdiction = await Jurisdiction.findById(id);
  if (!jurisdiction) throw new Error('Jurisdiction not found');
  if (jurisdiction.isDefault) throw new Error('Cannot delete default jurisdiction');
  
  await Jurisdiction.findByIdAndDelete(id, { session });
  
  // Invalidate cache
  activeJurisdictions = null;
  
  return true;
}

/**
 * Check player eligibility for jurisdiction
 */
export async function checkPlayerEligibility(player, action, context = {}) {
  const { jurisdictionCode = 'DEFAULT' } = context;
  
  const jurisdictions = await loadActiveJurisdictions();
  const jurisdiction = jurisdictions.find(j => j.code === jurisdictionCode.toUpperCase());
  
  if (!jurisdiction) {
    return { eligible: true, reason: 'No jurisdiction rules found' };
  }
  
  const { requirements } = jurisdiction;
  
  // Check age
  if (player.age && player.age < requirements.minimumAge) {
    return { 
      eligible: false, 
      reason: `Minimum age requirement: ${requirements.minimumAge}`,
      jurisdiction: jurisdiction.code,
    };
  }
  
  // Check KYC
  if (requirements.kycRequired && !player.kycVerified) {
    return { 
      eligible: false, 
      reason: 'KYC verification required',
      jurisdiction: jurisdiction.code,
    };
  }
  
  // Check game type restrictions
  if (context.gameType) {
    if (requirements.restrictedGameTypes?.includes(context.gameType)) {
      return { 
        eligible: false, 
        reason: `Game type ${context.gameType} is restricted in this jurisdiction`,
        jurisdiction: jurisdiction.code,
      };
    }
    
    if (requirements.allowedGameTypes?.length > 0 && 
        !requirements.allowedGameTypes.includes(context.gameType)) {
      return { 
        eligible: false, 
        reason: `Game type ${context.gameType} is not allowed in this jurisdiction`,
        jurisdiction: jurisdiction.code,
      };
    }
  }
  
  // Check payment method restrictions
  if (context.paymentMethod) {
    if (requirements.restrictedPaymentMethods?.includes(context.paymentMethod)) {
      return { 
        eligible: false, 
        reason: `Payment method ${context.paymentMethod} is restricted in this jurisdiction`,
        jurisdiction: jurisdiction.code,
      };
    }
    
    if (requirements.allowedPaymentMethods?.length > 0 && 
        !requirements.allowedPaymentMethods.includes(context.paymentMethod)) {
      return { 
        eligible: false, 
        reason: `Payment method ${context.paymentMethod} is not allowed in this jurisdiction`,
        jurisdiction: jurisdiction.code,
      };
    }
  }
  
  // Check currency restrictions
  if (context.currency) {
    if (requirements.allowedCurrencies?.length > 0 && 
        !requirements.allowedCurrencies.includes(context.currency)) {
      return { 
        eligible: false, 
        reason: `Currency ${context.currency} is not allowed in this jurisdiction`,
        jurisdiction: jurisdiction.code,
      };
    }
  }
  
  return { 
    eligible: true, 
    jurisdiction: jurisdiction.code,
    requirements,
  };
}

/**
 * Get jurisdiction statistics
 */
export async function getJurisdictionStats() {
  const [total, active, defaultJurisdiction] = await Promise.all([
    Jurisdiction.countDocuments(),
    Jurisdiction.countDocuments({ isActive: true }),
    Jurisdiction.findOne({ isDefault: true }),
  ]);
  
  return {
    total,
    active,
    inactive: total - active,
    defaultCode: defaultJurisdiction?.code || 'DEFAULT',
  };
}

/**
 * Get compliance rules for jurisdiction
 */
export async function getComplianceRules(jurisdictionCode) {
  const jurisdictions = await loadActiveJurisdictions();
  const jurisdiction = jurisdictions.find(j => j.code === jurisdictionCode.toUpperCase());
  
  if (!jurisdiction) {
    return null;
  }
  
  return {
    code: jurisdiction.code,
    name: jurisdiction.name,
    requirements: jurisdiction.requirements,
    compliance: jurisdiction.compliance,
    technical: jurisdiction.technical,
  };
}
