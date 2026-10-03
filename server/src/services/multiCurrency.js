import mongoose from 'mongoose';
import escapeStringRegexp from 'escape-string-regexp';
import Currency from '../models/Currency.js';
import { CURRENCY_DEFINITIONS, DEFAULT_CURRENCY_CODE } from '../currency/registry.js';

/**
 * Multi-Currency Service
 * Supports multiple currencies with exchange rates
 */

// In-memory cache for active currencies
let activeCurrencies = null;
let lastLoaded = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Load active currencies from database
 */
async function loadActiveCurrencies() {
  const now = Date.now();
  if (activeCurrencies && now - lastLoaded < CACHE_TTL) {
    return activeCurrencies;
  }
  
  try {
    activeCurrencies = await Currency.find({ isActive: true }).lean();
    lastLoaded = now;
  } catch (error) {
    // Fallback to default currency if DB fails
    activeCurrencies = [{
      code: DEFAULT_CURRENCY_CODE,
      name: 'Turkish Lira',
      symbol: '₺',
      locale: 'tr-TR',
      exchangeRate: 1,
      isDefault: true,
      decimalPlaces: 2,
    }];
  }
  
  return activeCurrencies;
}

/**
 * Get all currencies
 */
export async function getAllCurrencies(options = {}) {
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
  
  const [currencies, total] = await Promise.all([
    Currency.find(filter)
      .sort({ isDefault: -1, code: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username'),
    Currency.countDocuments(filter),
  ]);
  
  return {
    currencies,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Get currency by code
 */
export async function getCurrencyByCode(code) {
  return Currency.findOne({ code: code.toUpperCase() });
}

/**
 * Get default currency
 */
export async function getDefaultCurrency() {
  return Currency.findOne({ isDefault: true });
}

/**
 * Get active currencies (cached)
 */
export async function getActiveCurrencies() {
  return loadActiveCurrencies();
}

/**
 * Create a new currency
 */
export async function createCurrency(data, options = {}) {
  const { session = null } = options;
  
  // Check if currency already exists
  const existing = await Currency.findOne({ code: data.code.toUpperCase() });
  if (existing) {
    throw new Error(`Currency ${data.code} already exists`);
  }
  
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await Currency.updateMany({ isDefault: true }, { isDefault: false }, { session });
  }
  
  const currency = await Currency.create([{
    ...data,
    code: data.code.toUpperCase(),
  }], { session });
  
  // Invalidate cache
  activeCurrencies = null;
  
  return currency[0];
}

/**
 * Update currency
 */
export async function updateCurrency(id, data, options = {}) {
  const { session = null } = options;
  
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await Currency.updateMany(
      { isDefault: true, _id: { $ne: id } },
      { isDefault: false },
      { session }
    );
  }
  
  const currency = await Currency.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, session }
  );
  
  // Invalidate cache
  activeCurrencies = null;
  
  return currency;
}

/**
 * Delete currency
 */
export async function deleteCurrency(id, options = {}) {
  const { session = null } = options;
  
  // Don't allow deleting default currency
  const currency = await Currency.findById(id);
  if (!currency) throw new Error('Currency not found');
  if (currency.isDefault) throw new Error('Cannot delete default currency');
  
  await Currency.findByIdAndDelete(id, { session });
  
  // Invalidate cache
  activeCurrencies = null;
  
  return true;
}

/**
 * Convert amount between currencies
 */
export async function convertAmount(amount, fromCode, toCode) {
  const currencies = await loadActiveCurrencies();
  
  const fromCurrency = currencies.find(c => c.code === fromCode.toUpperCase());
  const toCurrency = currencies.find(c => c.code === toCode.toUpperCase());
  
  if (!fromCurrency) throw new Error(`Currency ${fromCode} not found`);
  if (!toCurrency) throw new Error(`Currency ${toCode} not found`);
  
  // Convert to base currency (TRY) first, then to target
  // exchangeRate represents: 1 unit of this currency = X TRY
  const baseAmount = amount * fromCurrency.exchangeRate;
  const result = baseAmount / toCurrency.exchangeRate;
  
  return {
    amount,
    from: fromCode.toUpperCase(),
    to: toCode.toUpperCase(),
    rate: toCurrency.exchangeRate / fromCurrency.exchangeRate,
    result: parseFloat(result.toFixed(toCurrency.decimalPlaces || 2)),
  };
}

/**
 * Update exchange rate
 */
export async function updateExchangeRate(id, rate, options = {}) {
  const { session = null } = options;
  
  if (rate <= 0) throw new Error('Exchange rate must be positive');
  
  const currency = await Currency.findByIdAndUpdate(
    id,
    { $set: { exchangeRate: rate } },
    { new: true, session }
  );
  
  // Invalidate cache
  activeCurrencies = null;
  
  return currency;
}

/**
 * Bulk update exchange rates
 */
export async function bulkUpdateExchangeRates(rates, options = {}) {
  const { session = null } = options;
  
  const operations = rates.map(({ code, rate }) => ({
    updateOne: {
      filter: { code: code.toUpperCase() },
      update: { $set: { exchangeRate: rate } },
    },
  }));
  
  await Currency.bulkWrite(operations, { session });
  
  // Invalidate cache
  activeCurrencies = null;
  
  return { updated: rates.length };
}

/**
 * Seed default currencies from registry
 */
export async function seedDefaultCurrencies() {
  const existing = await Currency.countDocuments();
  if (existing > 0) return { seeded: 0 };
  
  const currencies = CURRENCY_DEFINITIONS.map(def => ({
    ...def,
    exchangeRate: def.code === DEFAULT_CURRENCY_CODE ? 1 : 
                  def.code === 'USD' ? 32.5 : // Approximate USD/TRY
                  35.0, // Approximate EUR/TRY and others
    isDefault: def.code === DEFAULT_CURRENCY_CODE,
    isActive: true,
  }));
  
  await Currency.insertMany(currencies);
  
  return { seeded: currencies.length };
}

/**
 * Get currency statistics
 */
export async function getCurrencyStats() {
  const [total, active, defaultCurrency] = await Promise.all([
    Currency.countDocuments(),
    Currency.countDocuments({ isActive: true }),
    Currency.findOne({ isDefault: true }),
  ]);
  
  return {
    total,
    active,
    inactive: total - active,
    defaultCode: defaultCurrency?.code || DEFAULT_CURRENCY_CODE,
  };
}
