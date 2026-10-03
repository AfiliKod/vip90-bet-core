import {
  getAllCurrencies,
  getCurrencyByCode,
  getDefaultCurrency,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  convertAmount,
  updateExchangeRate,
  bulkUpdateExchangeRates,
  getCurrencyStats,
} from '../services/multiCurrency.js';

/**
 * GET /api/admin/currencies
 * Get all currencies
 */
export async function getAllCurrenciesHandler(req, res, next) {
  try {
    const { page, limit, isActive, search } = req.query;
    const result = await getAllCurrencies({ 
      page, 
      limit, 
      search,
      isActive: isActive !== undefined ? isActive === 'true' : null 
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/currencies/default
 * Get default currency
 */
export async function getDefaultCurrencyHandler(req, res, next) {
  try {
    const currency = await getDefaultCurrency();
    res.json({ currency });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/currencies/stats
 * Get currency statistics
 */
export async function getCurrencyStatsHandler(req, res, next) {
  try {
    const stats = await getCurrencyStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/currencies/:code
 * Get currency by code
 */
export async function getCurrencyByCodeHandler(req, res, next) {
  try {
    const currency = await getCurrencyByCode(req.params.code);
    if (!currency) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Currency not found' } });
    }
    res.json({ currency });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/currencies
 * Create a new currency
 */
export async function createCurrencyHandler(req, res, next) {
  try {
    const currency = await createCurrency({
      ...req.body,
      createdBy: req.user.id,
    });
    res.status(201).json({ currency });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/currencies/:id
 * Update currency
 */
export async function updateCurrencyHandler(req, res, next) {
  try {
    const currency = await updateCurrency(req.params.id, {
      ...req.body,
      updatedBy: req.user.id,
    });
    if (!currency) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Currency not found' } });
    }
    res.json({ currency });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/currencies/:id
 * Delete currency
 */
export async function deleteCurrencyHandler(req, res, next) {
  try {
    await deleteCurrency(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/currencies/convert
 * Convert amount between currencies
 */
export async function convertAmountHandler(req, res, next) {
  try {
    const { amount, from, to } = req.body;
    const result = await convertAmount(amount, from, to);
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/currencies/:id/rate
 * Update exchange rate
 */
export async function updateExchangeRateHandler(req, res, next) {
  try {
    const { rate } = req.body;
    const currency = await updateExchangeRate(req.params.id, rate);
    if (!currency) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Currency not found' } });
    }
    res.json({ currency });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/currencies/rates/bulk
 * Bulk update exchange rates
 */
export async function bulkUpdateExchangeRatesHandler(req, res, next) {
  try {
    const { rates } = req.body;
    const result = await bulkUpdateExchangeRates(rates);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
