import { scopeTenantId } from '../tenancy/tenantFilter.js';
import {
  getAllBrands,
  getBrandById as getBrandByIdService,
  getBrandBySlug,
  getBrandByDomain,
  getDefaultBrand,
  createBrand,
  updateBrand as updateBrandService,
  deleteBrand,
  addDomain,
  removeDomain,
  setPrimaryDomain,
  getBrandStats,
} from '../services/multiBrand.js';
import { createError } from '../middleware/error.js';

/**
 * Brand `:id` endpoints are tenant-scoped (İP-5, §9 G-3): a `:id` that
 * belongs to another tenant answers 404 `NOT_FOUND`, never 403 and never
 * the record. Single-tenant installs keep the legacy behaviour when the
 * request carries no tenant.
 */

/** GET /api/admin/brands */
export async function getAllBrandsHandler(req, res, next) {
  try {
    const { page, limit, isActive, search } = req.query;
    const result = await getAllBrands({
      page,
      limit,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : null,
      tenantId: scopeTenantId(req),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/brands/default */
export async function getDefaultBrandHandler(req, res, next) {
  try {
    const brand = await getDefaultBrand({ tenantId: scopeTenantId(req) });
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/brands/stats */
export async function getBrandStatsHandler(req, res, next) {
  try {
    const stats = await getBrandStats({ tenantId: scopeTenantId(req) });
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/brands/slug/:slug */
export async function getBrandBySlugHandler(req, res, next) {
  try {
    const brand = await getBrandBySlug(req.params.slug, { tenantId: scopeTenantId(req) });
    if (!brand) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Brand not found' } });
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/brands/domain/:domain */
export async function getBrandByDomainHandler(req, res, next) {
  try {
    const brand = await getBrandByDomain(req.params.domain, { tenantId: scopeTenantId(req) });
    if (!brand) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Brand not found' } });
    }
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/brands/:id */
export async function getBrandById(req, res, next) {
  try {
    const brand = await getBrandByIdService(req.params.id, { tenantId: scopeTenantId(req) });
    if (!brand) throw createError(404, 'NOT_FOUND', 'Brand not found');
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

export const getBrandByIdHandler = getBrandById;

/** POST /api/admin/brands */
export async function createBrandHandler(req, res, next) {
  try {
    // Never trust a tenantId from the body: the ambient tenant wins.
    const { tenantId: _skip, ...body } = req.body ?? {};
    const brand = await createBrand({
      ...body,
      createdBy: req.user?.id,
    });
    res.status(201).json({ brand });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/brands/:id */
export async function updateBrand(req, res, next) {
  try {
    // Never trust a tenantId from the body: the ambient tenant wins.
    const { tenantId: _skip, _id, ...body } = req.body ?? {};
    const brand = await updateBrandService(
      req.params.id,
      { ...body, updatedBy: req.user?.id },
      { tenantId: scopeTenantId(req) },
    );
    if (!brand) throw createError(404, 'NOT_FOUND', 'Brand not found');
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

export const updateBrandHandler = updateBrand;

/** DELETE /api/admin/brands/:id */
export async function deleteBrandHandler(req, res, next) {
  try {
    await deleteBrand(req.params.id, { tenantId: scopeTenantId(req) });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/brands/:id/domains */
export async function addDomainHandler(req, res, next) {
  try {
    const { domain } = req.body;
    const brand = await addDomain(req.params.id, domain, { tenantId: scopeTenantId(req) });
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/admin/brands/:id/domains/:domain */
export async function removeDomainHandler(req, res, next) {
  try {
    const brand = await removeDomain(req.params.id, req.params.domain, { tenantId: scopeTenantId(req) });
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/admin/brands/:id/domains/:domain/primary */
export async function setPrimaryDomainHandler(req, res, next) {
  try {
    const brand = await setPrimaryDomain(req.params.id, req.params.domain, { tenantId: scopeTenantId(req) });
    res.json({ brand });
  } catch (error) {
    next(error);
  }
}
