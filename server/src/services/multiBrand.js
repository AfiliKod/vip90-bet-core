import mongoose from 'mongoose';
import escapeStringRegexp from 'escape-string-regexp';
import Brand from '../models/Brand.js';

/**
 * Multi-Brand Service
 * Supports multiple brands with different configurations
 */

// In-memory cache for active brands
let activeBrands = null;
let lastLoaded = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Load active brands from database
 */
async function loadActiveBrands() {
  const now = Date.now();
  if (activeBrands && now - lastLoaded < CACHE_TTL) {
    return activeBrands;
  }
  
  try {
    activeBrands = await Brand.find({ isActive: true }).lean();
    lastLoaded = now;
  } catch (error) {
    // Fallback to default brand if DB fails
    activeBrands = [{
      slug: 'default',
      name: 'Default Brand',
      isActive: true,
      isDefault: true,
      currencies: ['TRY'],
      modules: [],
    }];
  }
  
  return activeBrands;
}

/**
 * Get all brands
 */
export async function getAllBrands(options = {}) {
  const { page = 1, limit = 50, isActive = null } = options;
  const search = options.search || '';
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = {};
  if (isActive !== null) filter.isActive = isActive;
  // Kullanıcı araması: client `search` gönderiyordu ama servis desteklemiyordu
  // (arama yalnız mevcut sayfayı süzerdi). ReDoS'a karşı desen kaçırılır.
  if (search) {
    const re = new RegExp(escapeStringRegexp(String(search).trim()), 'i');
    filter.$or = [ { name: re }, { name: re } ];
  }
  
  const [brands, total] = await Promise.all([
    Brand.find(filter)
      .sort({ isDefault: -1, name: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username'),
    Brand.countDocuments(filter),
  ]);
  
  return {
    brands,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Get brand by ID
 */
export async function getBrandById(id) {
  return Brand.findById(id)
    .populate('createdBy', 'username')
    .populate('updatedBy', 'username');
}

/**
 * Get brand by slug
 */
export async function getBrandBySlug(slug) {
  return Brand.findOne({ slug })
    .populate('createdBy', 'username')
    .populate('updatedBy', 'username');
}

/**
 * Get brand by domain
 */
export async function getBrandByDomain(domain) {
  return Brand.findOne({ 
    'domains.domain': domain,
    isActive: true 
  });
}

/**
 * Get default brand
 */
export async function getDefaultBrand() {
  return Brand.findOne({ isDefault: true });
}

/**
 * Get active brands (cached)
 */
export async function getActiveBrands() {
  return loadActiveBrands();
}

/**
 * Create a new brand
 */
export async function createBrand(data, options = {}) {
  const { session = null } = options;
  
  // Check if brand slug already exists
  const existing = await Brand.findOne({ slug: data.slug?.toLowerCase() });
  if (existing) {
    throw new Error(`Brand with slug ${data.slug} already exists`);
  }
  
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await Brand.updateMany({ isDefault: true }, { isDefault: false }, { session });
  }
  
  const brand = await Brand.create([{
    ...data,
    slug: data.slug?.toLowerCase(),
    domains: data.domains?.map(d => ({
      ...d,
      domain: d.domain.toLowerCase(),
    })) || [],
  }], { session });
  
  // Invalidate cache
  activeBrands = null;
  
  return brand[0];
}

/**
 * Update brand
 */
export async function updateBrand(id, data, options = {}) {
  const { session = null } = options;
  
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await Brand.updateMany(
      { isDefault: true, _id: { $ne: id } },
      { isDefault: false },
      { session }
    );
  }
  
  // Normalize domains
  if (data.domains) {
    data.domains = data.domains.map(d => ({
      ...d,
      domain: d.domain.toLowerCase(),
    }));
  }
  
  const brand = await Brand.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, session }
  );
  
  // Invalidate cache
  activeBrands = null;
  
  return brand;
}

/**
 * Delete brand
 */
export async function deleteBrand(id, options = {}) {
  const { session = null } = options;
  
  // Don't allow deleting default brand
  const brand = await Brand.findById(id);
  if (!brand) throw new Error('Brand not found');
  if (brand.isDefault) throw new Error('Cannot delete default brand');
  
  await Brand.findByIdAndDelete(id, { session });
  
  // Invalidate cache
  activeBrands = null;
  
  return true;
}

/**
 * Add domain to brand
 */
export async function addDomain(brandId, domain, options = {}) {
  const { session = null } = options;
  
  const brand = await Brand.findById(brandId);
  if (!brand) throw new Error('Brand not found');
  
  // Check if domain already exists
  if (brand.domains.some(d => d.domain === domain.toLowerCase())) {
    throw new Error(`Domain ${domain} already exists`);
  }
  
  brand.domains.push({
    domain: domain.toLowerCase(),
    isPrimary: brand.domains.length === 0,
  });
  
  await brand.save({ session });
  
  // Invalidate cache
  activeBrands = null;
  
  return brand;
}

/**
 * Remove domain from brand
 */
export async function removeDomain(brandId, domain, options = {}) {
  const { session = null } = options;
  
  const brand = await Brand.findById(brandId);
  if (!brand) throw new Error('Brand not found');
  
  const domainIndex = brand.domains.findIndex(d => d.domain === domain.toLowerCase());
  if (domainIndex === -1) {
    throw new Error(`Domain ${domain} not found`);
  }
  
  // Don't allow removing primary domain
  if (brand.domains[domainIndex].isPrimary) {
    throw new Error('Cannot remove primary domain');
  }
  
  brand.domains.splice(domainIndex, 1);
  await brand.save({ session });
  
  // Invalidate cache
  activeBrands = null;
  
  return brand;
}

/**
 * Set primary domain
 */
export async function setPrimaryDomain(brandId, domain, options = {}) {
  const { session = null } = options;
  
  const brand = await Brand.findById(brandId);
  if (!brand) throw new Error('Brand not found');
  
  const domainObj = brand.domains.find(d => d.domain === domain.toLowerCase());
  if (!domainObj) {
    throw new Error(`Domain ${domain} not found`);
  }
  
  // Unset other primary domains
  brand.domains.forEach(d => {
    d.isPrimary = d.domain === domain.toLowerCase();
  });
  
  await brand.save({ session });
  
  // Invalidate cache
  activeBrands = null;
  
  return brand;
}

/**
 * Get brand statistics
 */
export async function getBrandStats() {
  const [total, active, defaultBrand] = await Promise.all([
    Brand.countDocuments(),
    Brand.countDocuments({ isActive: true }),
    Brand.findOne({ isDefault: true }),
  ]);
  
  return {
    total,
    active,
    inactive: total - active,
    defaultSlug: defaultBrand?.slug || 'default',
  };
}

/**
 * Check if brand has module enabled
 */
export async function isModuleEnabled(brandSlug, moduleName) {
  const brands = await loadActiveBrands();
  const brand = brands.find(b => b.slug === brandSlug);
  
  if (!brand) return false;
  
  const module = brand.modules?.find(m => m.name === moduleName);
  return module?.isEnabled ?? true; // Default to enabled if not configured
}

/**
 * Get brand currencies
 */
export async function getBrandCurrencies(brandSlug) {
  const brands = await loadActiveBrands();
  const brand = brands.find(b => b.slug === brandSlug);
  
  if (!brand) return ['TRY']; // Default to TRY
  
  return brand.currencies?.length > 0 ? brand.currencies : ['TRY'];
}
