import {
  getAllBrands,
  getBrandById,
  getBrandBySlug,
  getBrandByDomain,
  getDefaultBrand,
  createBrand,
  updateBrand,
  deleteBrand,
  addDomain,
  removeDomain,
  setPrimaryDomain,
  getBrandStats,
} from '../services/multiBrand.js';

/**
 * GET /api/admin/brands
 * Get all brands
 */
export async function getAllBrandsHandler(req, res, next) {
  try {
    const { page, limit, isActive, search } = req.query;
    const result = await getAllBrands({ 
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
 * GET /api/admin/brands/default
 * Get default brand
 */
export async function getDefaultBrandHandler(req, res, next) {
  try {
    const brand = await getDefaultBrand();
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/brands/stats
 * Get brand statistics
 */
export async function getBrandStatsHandler(req, res, next) {
  try {
    const stats = await getBrandStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/brands/slug/:slug
 * Get brand by slug
 */
export async function getBrandBySlugHandler(req, res, next) {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Brand not found' } });
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/brands/domain/:domain
 * Get brand by domain
 */
export async function getBrandByDomainHandler(req, res, next) {
  try {
    const brand = await getBrandByDomain(req.params.domain);
    if (!brand) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Brand not found' } });
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/brands/:id
 * Get brand by ID
 */
export async function getBrandByIdHandler(req, res, next) {
  try {
    const brand = await getBrandById(req.params.id);
    if (!brand) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Brand not found' } });
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/brands
 * Create a new brand
 */
export async function createBrandHandler(req, res, next) {
  try {
    const brand = await createBrand({
      ...req.body,
      createdBy: req.user.id,
    });
    res.status(201).json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/brands/:id
 * Update brand
 */
export async function updateBrandHandler(req, res, next) {
  try {
    const brand = await updateBrand(req.params.id, {
      ...req.body,
      updatedBy: req.user.id,
    });
    if (!brand) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Brand not found' } });
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/brands/:id
 * Delete brand
 */
export async function deleteBrandHandler(req, res, next) {
  try {
    await deleteBrand(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/brands/:id/domains
 * Add domain to brand
 */
export async function addDomainHandler(req, res, next) {
  try {
    const { domain } = req.body;
    const brand = await addDomain(req.params.id, domain);
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/brands/:id/domains/:domain
 * Remove domain from brand
 */
export async function removeDomainHandler(req, res, next) {
  try {
    const brand = await removeDomain(req.params.id, req.params.domain);
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/brands/:id/domains/:domain/primary
 * Set primary domain
 */
export async function setPrimaryDomainHandler(req, res, next) {
  try {
    const brand = await setPrimaryDomain(req.params.id, req.params.domain);
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}
